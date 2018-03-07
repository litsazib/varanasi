/*!
 * Author: @RoktimSazib
 */

;(function () {	

	var W = window,
		D = document,
		root = this,
		prev_sbook = root.BookTable;

	function BookTable( opts ) {
		
		var self = this;

		// Default options
		var default_opts = {
			initialState : 'close',
			currentPage : 'start',
			defaultRestID : 0,
			defaultRestName : '',
			defaultGuests : 2,
			holdingTime: 5 * 60, // Hold reserved table for 5 minutes
			dateOpts: { // Pikaday options
				firstDay: 1, // (0: Sunday, 1: Monday, etc)
				minDate: new Date(),
				theme: 'sbook-cal',
				field: D.getElementById( 'sbook-field-date' ),
				position: 'top left',
				disableDayFn : function( theDate ) {
					var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
						dayNo = days[ theDate.getDay() ];

					if( self._workingDays.indexOf( dayNo ) == -1 ) {
						return true; // Restaurant is closed on current day.
					}
				}
			}
		};

		// Setup and establish options
		this.opts = default_opts;	
		for( var k in opts ) { this.opts[k] = opts[k]; }

		// Useful data
		this._events = {};
		this._currentUser = this._getCookie( 'sbookCurrentUser' ),
		this._currentPage = this._getCookie( 'sbookCurrentPage' ) || this.opts.currentPage;
		this._bookID = this._getCookie( 'sbookBookID' ) || 0;
		this._bookingHash = this._getCookie( 'sbookBookingHash' );
		this._bookGuests = this._getCookie( 'sbookBookGuests' ) || this.opts.defaultGuests;
		this._bookGuestsStr = this._getCookie( 'sbookBookGuestsStr' ) || '';
		this._bookDate = this._getCookie( 'sbookBookDate' ) || 0;
		this._bookTime = this._getCookie( 'sbookBookTime' ) || '19:00';
		this._bookDateTs = this._getCookie( 'sbookBookDateTs' ) || 0; // mysql timestamp
		this._selectedDate = ''; // ISO format
		this._workingDays = [];
		this._timers = {}; // Timers

		// Update restaurant data
		this._restID = this._getCookie( 'sbookRestID' ) || this.opts.defaultRestID;
		this._restName = this._getCookie( 'sbookRestName' ) || this.opts.defaultRestName;

		// Current restaurant deleted
		// So clean all cache and reload the page again
		if( this._restID && !sbookOpts.rests[this._restID] ) {
			this._cleanup();
			W.location.reload();
		}

		if( this._restID ) {
			this._updateRest();
		}

		// Set initial page
		this._initialPage = this._currentPage;

		// Common elements
		this.$popup = D.getElementById( 'sbook-popup' );
		this.$currentPage = D.getElementById( 'sbook-page-' + this._currentPage );

	}

	//
	// Internal methods
	// ------------------

	BookTable.prototype = {

		/**
		 * Initiate the application.
		 */
		_init : function() {

			// Finite state machines
			this._State = new ScreetsFSM.Machine();

			// Build machine
			this._machine();

			// Update current user data after logged in
			if( sbookOpts.loggedIn ) {

				this._currentUser = JSON.parse( this._currentUser ) || {};
				for( var k in sbookOpts.currentUser ) { 
					this._currentUser[k] = sbookOpts.currentUser[k]; 
				}

				this._updateData( 'currentUser', JSON.stringify( this._currentUser ) );
			}

			// Actions
			this._actions();

			// Page UI
			this._ui();

			// Activate initial page
			this.goPage( this._currentPage );

			// Set initial state
			if( this.opts.initialState ) {
				var initialState = this._getCookie( 'sbookState' ) || this.opts.initialState;
				this.updateState( initialState );
			}

		},

		/**
		 * User interface.
		 */
		_ui : function() {
			var self = this;

			// Listen restaurant field
			var $restFields = D.querySelectorAll( '.sbook-field-restaurants' );
			var fn_listenRest = function(e) {
				var restID = this.value;
				self._updateRest( restID, sbookOpts.rests[restID].name );
			};

			if( $restFields ) {
				for( var i=0; i<$restFields.length; i++ ) {
					$restFields[i].addEventListener( 'change', fn_listenRest );
				}
			}

			// Listen overflow clicks
			if( this.$popup ) {
				this.$popup.addEventListener( 'click', function(e) {

					if( !e ) { return; }

					if( e.target.id === 'sbook-popup-wrap' ) {
						e.preventDefault();
						self.updateState( 'close' );
					}
				});
			}

		},

		/**
		 * Actions.
		 */
		_actions : function() {

			var self = this,
				$actionMenuLinks = D.getElementsByClassName( 'sbook-action-menu' ),
				$actionBtns = D.getElementsByClassName( 'sbook-action-btn' );

			// Action button clicks
			var fn_clickBtn = function(e) {
				e.preventDefault();

				var action = this.getAttribute( 'data-action' ),
					restaurants = D.getElementById( this.getAttribute( 'data-list' ) );

				if( !action ) return;

				switch( action ) {

					/* Go a page */
					case 'goPage':
						var page = this.getAttribute( 'href' ).substring(1);
						self.goPage( page );
						break;

					/* Open popup */
					case 'open':
						var restID = parseInt( this.getAttribute( 'data-restaurant' ) );

						// Update restaurant ID and go to reservation page
						if( restID > 0 && sbookOpts.rests[restID] ) {
							self._updateRest( restID, sbookOpts.rests[restID].name );
							
							self.goPage( 'reservation' );
						}

						self.updateState( 'open' );
						break;

					/* Close popup */
					case 'close':
						self.updateState( 'close' );
						break;

					/* Start reservation */
					case 'startReservation':

						if( restaurants ) {

							var f_rest = restaurants.options[restaurants.selectedIndex],
								restID = f_rest.value;

							// Update restaurant data
							self._updateRest( restID, sbookOpts.rests[restID].name );

							self.goPage( 'reservation' );
						}

						break;

					// Cancel a booking
					case 'cancelBooking':
						if( confirm( self.opts._confirmCancel ) ) {

							self._post( 'cancelBooking', { bookID: self._bookID, hash: self._bookingHash }, function(r) {
								console.log(r);

								if( !r.success ) {
									console.error( r.data );
									return;
								}

								// Update page content
								D.querySelector( '.sbook-page-cancellation .sbook-desc' ).innerHTML = r.data;

								// Go to related page
								self.goPage( 'cancellation' );

							});

						}
						break;
				}

			};

			// Action menu link clicks
			var fn_clickMenu = function(e) {
				e.preventDefault();

				var $link = this.querySelector('a'),
					type = $link.getAttribute('href').substring(1);

				switch( type ) {
					case 'open-popup':
						self.updateState( 'open' );
						break;
				}
			};

			if( $actionMenuLinks ) {
				for( var i=0; i < $actionMenuLinks.length; i++ ) {
					$actionMenuLinks[i].addEventListener( 'click', fn_clickMenu );
				}
			}

			if( $actionBtns ) {
				for( var i=0; i < $actionBtns.length; i++ ) {
					$actionBtns[i].addEventListener( 'click', fn_clickBtn );
				}
			}

		},

		/**
		 * Build state machine.
		 */
		_machine : function() {

			var allowMinimize = ( this.opts.closeAction === 'minimize' ) ? true : false;

			// Set initial state
			this._State.setInitialState( 'minimize' );

			// Do various things when popup is MINIMIZED
			this._State.addTransition( 'open', 'minimize', 'open', this._onOpen.bind( this ) ); // minimize -> open
			this._State.addTransition( 'close', 'minimize', 'close', this._onClose.bind( this ) ); // minimize -> close
			this._State.addTransition( 'minimize', 'minimize', 'minimize', this._onMinimize.bind( this ) ); // minimize -> minimize

			// Do various things when popup is OPEN
			if( allowMinimize ) {
				this._State.addTransition( 'close', 'open', 'minimize', this._onMinimize.bind( this ) ); // open -> minimize
				this._State.addTransition( 'open', 'open', 'minimize', this._onMinimize.bind( this ) ); // open -> minimize (toggle)
			} else {
				this._State.addTransition( 'close', 'open', 'close', this._onClose.bind( this ) ); // open -> close
				this._State.addTransition( 'open', 'open', 'close', this._onClose.bind( this ) ); // open -> close (toggle)
			}

			// Do various things when popup is CLOSED
			this._State.addTransition( 'open', 'close', 'open', this._onOpen.bind( this ) ); // minimize -> open

		},

		_onOpen : function() {

			this._state = 'open';

			// Show the popup
			this._addClass( 'sbook-active', this.$popup );
			
			// Invoke the event
			this._invoke( 'onOpen' );

		},

		_onClose : function() {

			this._state = 'close';

			// Show the popup
			this._removeClass( 'sbook-active', this.$popup );

			// Invoke the event
			this._invoke( 'onClose' );

		},

		_onMinimize : function() {

			this._state = 'minimize';

			// Invoke the event
			this._invoke( 'onMinimize' );

		},

		_onStart : function() {

			// Select active restaurant
			if( this._restID ) {
				this.$currentPage.querySelector( '.sbook-field-restaurants' ).value = this._restID;
			}

			// Invoke the event
			this._invoke( 'onStart' );

		},

		_onReservation : function() {
			
			var self = this,
				$searchForm = this.$currentPage.querySelector( '.sbook-date-picker' );

			// Prepare search form
			this._prepareSearchForm();

			// Update restaurant name
			this.$currentPage.querySelector( '.sbook-restaurant-name' ).innerHTML = this._restName;

			// Listen search form
			$searchForm.addEventListener( 'submit', function(e) {
				e.preventDefault();

				var $submitBtn = this.querySelector( '.sbook-submit' );
				self._addClass( 'sbook-sending', $submitBtn );

				self._findTable( function(r) {
					self._removeClass( 'sbook-sending', $submitBtn );
				});
			});

			// Send reservation form on popup page select
			// this._trigger( 'submit', $searchForm );

			// Invoke the event
			this._invoke( 'onReservation' );

		},

		_onSearch : function() {

			var self = this,
				$times = D.querySelectorAll( '#sbook-result-times li a' );

			// Search mode can't be a initial page. 
			// It is just for showing results
			if( this._initialPage === 'search' ) {
				this.goPage( 'reservation' );
			}

			// Prepare search form
			this._prepareSearchForm();

			var fn_click = function(e) {
				e.preventDefault();

				// Update booking data
				self._updateData( 'restName', this.getAttribute('data-rest-name') );
				self._updateData( 'bookGuests', this.getAttribute('data-guests') );
				self._updateData( 'bookGuestsStr', this.getAttribute('data-guests-str') );
				self._updateData( 'bookTime', this.getAttribute('data-time') );
				self._updateData( 'bookDate', this.getAttribute('data-date') );
				self._updateData( 'bookDateTs', this.getAttribute('data-timestamp') );

				console.log( self._bookDateTs, self._bookTime );

				var data = {
					restID: self._restID,
					guests: self._bookGuests,
					timestamp: self._bookDateTs
				};

				self._post( 'holdTable', data, function(r) {

					if( !r.success ) {
						console.error( r.data );
						return;
					}

					console.log(r);

					// Update current user info
					if( r.data.user ) {
						self._updateData( 'currentUser', JSON.stringify( r.data.user ) );
					}

					// Update book data
					self._updateData( 'bookID', r.data.bookID );
					self._updateData( 'bookingHash', r.data.hash );

					// Update page state
					self.goPage( 'registration' );
					
				});

			};

			if( $times ) {
				for( var i=0; i<$times.length; i++ ) {
					$times[i].addEventListener( 'click', fn_click );
				}
			}

			// Invoke the event
			this._invoke( 'onSearch' );

		},

		_onRegistration : function() {

			var self = this;

			if( !this._getCookie( 'sbookRestID' ) ) {
				this.goPage( 'start' );
			}
			if( !this._getCookie( 'sbookBookDate' ) ) {
				this.goPage( 'reservation' );
			}
			// Check if current booking is still available for booking
			if( this._initialPage === 'registration' && this._bookID > 0 ) {

				this._post( 'isAvailBooking', { bookID: this._bookID }, function(r) {

					// Booking is NOT valid! Go back to search
					if( !r.success ) {
						console.warn( 'Latest booking is not valid anymore.' );
						self._cleanup( 'book' );
						self.goPage( 'reservation' );
						return;
					}

					// Set initial page as search to prevent further conflicts
					self._initialPage = '';

					// It's valid! So Re-run registration
					self.goPage( 'registration' );
				});
				return;
			}

			if( sbookOpts.loggedIn ) {
				this._showForm( 'userBooking' );
			} else {
				this._showForm( 'guestBooking' );
			}

			var timerID = Math.floor( ( Math.random() * 9999 ) + 1 ); // btw. 1 - 9999

			// Auto-fill current form fields
			self._autoFillCurrentForm();

			$holdingNtf = D.querySelector( '.sbook-holding-ntf' );
			$holdingError = D.querySelector( '.sbook-holding-err' );

			// Update summary fields
			D.querySelector( '.sbook-guests-val' ).innerHTML = this._bookGuestsStr;
			D.querySelector( '.sbook-date-val' ).innerHTML = this._bookDate;
			D.querySelector( '.sbook-time-val' ).innerHTML = this._bookTime;
			D.querySelector( '.sbook-restaurant-val' ).innerHTML = this._restName;

			var $lastTimer = D.querySelector( '.sbook-holding-timer' );
			// Re-start timer if already exists
			if( $lastTimer ) {
				$lastTimer.id = 'sbook-timer-' + timerID;

			// Set new timer for holding message
			} else {
				$holdingNtf.innerHTML = $holdingNtf.innerHTML.replace( '{TIME}', '<span id="sbook-timer-' + timerID + '" class="sbook-holding-timer"></span>' );
			}
			this._addClass( 'sbook-active', $holdingNtf );

			// Clear previous timer
			if( this._timers.holding ) {
				W.clearInterval( this._timers.holding );
			}
			// Run timer
			this._timers.holding = intervalId = this._timer( this.opts.holdingTime, D.getElementById( 'sbook-timer-' + timerID ) );

			// Show error after 5 minutes
			setTimeout( function(e) {
				self._removeClass( 'sbook-active', $holdingNtf );
				self._addClass( 'sbook-active', $holdingError );

			}, ( this.opts.holdingTime * 1000 ) + 2000 ); // 2000 for the delay from timer

			// Listen "edit" button
			D.querySelector( '.sbook-edit-booking' ).addEventListener( 'click', function(e) {
				e.preventDefault();

				// Clear cookies
				self._cleanup( 'search' );

				self.goPage( 'reservation' );
			});

			// LISTEN FORMS (on registration page)
			var $forms = this.$currentPage.querySelectorAll( 'form.sbook-form' ),
				el = {};

			var fn_listenFormSubmit = function(e) { 
				e.preventDefault();

				var $submitBtn = this.querySelector( 'button[type="submit"]' ),
					btnTitle = $submitBtn.innerHTML;
				
				// Clear notifications
				self.hideNtf();

				// Make button loader
				self._addClass( 'sbook-sending', $submitBtn );
				$submitBtn.querySelector( 'span' ).innerHTML = 'Sending...';


				var data = {
						bookID: self._bookID,
						restID: self._restID,
						timestamp: self._bookDateTs,
						guests: self._bookGuests,
						hash: self._bookingHash
					},
					type = this.getAttribute('data-type'),
					fname = '';

				// Prepare form data
				for( var k=0; k<this.elements.length; k++ ) {
					el = this.elements[k];

					if( el.nodeName === 'INPUT' || el.nodeName === 'SELECT' || el.nodeName === 'TEXTAREA' ) {
						if( el.name ) {
							data[el.name] = el.value;
						}
					}
				}

				console.log( type, data );

				// Clean form errors
				var $field_errs = self.$currentPage.querySelectorAll( '.sbook-field.sbook-error' );

				if( $field_errs ) {
					for( var i=0; i<$field_errs.length; i++ ) {
						self._removeClass( 'sbook-error', $field_errs[i] );
					}
				}

				// Send form
				self._post( type, data, function(r) {
					
					console.log( type,r );

					// Reverse the button
					self._removeClass( 'sbook-sending', $submitBtn );
					$submitBtn.innerHTML = btnTitle;
						
					if( !r.success ) {

						var $currentForm = self.$currentPage.querySelector( '.sbook-form.sbook-active' );

						// Show the error
						self.showNtf( $currentForm.querySelector( '.sbook-ntf' ), r.data.msg, 'error' );

						// Show invalid form field error
						if( r.data.field ) {
							var $field = $currentForm.querySelector( '.sbook-field-' + r.data.field );

							if( $field ) {
								self._addClass( 'sbook-error', $field );
							}
						}

						return;
					}

					switch( type ) {
						case 'signupBooking':

							// Complete reservation on booking pages...
							// The plugin requires refreshing after user signup
							// and this is the safest way to complete the reservation.
							W.location.href = r.data.refreshURL;

							break;
						case 'completeBook':

							// Update the summary page
							D.querySelector( '.sbook-page-summary .sbook-desc' ).innerHTML = r.data;

							// Go to the next page
							self.goPage( 'summary' );
							break;

						case 'signin':

							// Update user data
							self._updateData( 'currentUser', JSON.stringify( r.data ) );

							// Refresh the page
							W.location.reload();

							break;
					}
				});
			};

			if( $forms ) {
				for( var i=0; i<$forms.length; i++ ) {
					$forms[i].addEventListener( 'submit', fn_listenFormSubmit, false );
				}
			}
			
			// USER LINKS
			var $btnSignIn = this.$currentPage.querySelector( '.sbook-btn-signin' ),
				$btnSignUp = this.$currentPage.querySelector( '.sbook-btn-signup' ),
				$btnAsGuest = this.$currentPage.querySelectorAll( '.sbook-btn-as-guest' ),
				$submitBtnSignIn = this.$currentPage.querySelector( '.sbook-submit-btn-signup' );

			// "Sign-in" link
			if( $btnSignIn ) {
				$btnSignIn.addEventListener( 'click', function(e) {
					e.preventDefault();

					self._showForm( 'signin' );

				});
			}

			// "Sign-up" link
			if( $btnSignUp ) {
				$btnSignUp.addEventListener( 'click', function(e) {
					e.preventDefault();

					self._showForm( 'signup' );

				});
			}

			// "Book as guest" link
			if( $btnAsGuest ) {
				for( var i=0; i<$btnAsGuest.length; i++ ) {
					$btnAsGuest[i].addEventListener( 'click', function(e) {
						e.preventDefault();

						self._showForm( 'guestBooking' );
					});
				}
			}

			/*if( $btnShowSignIn ) {
				for( var i=0; i < $btnShowSignIn.length; i++ ) {
					$btnShowSignIn[i].addEventListener( 'click', function(e) {
						e.preventDefault();

						// Show sign-in form
						self._addClass( 'sbook-active', D.getElementById('sbook-signin-form') );

						// Deactivate registration tabs
						self._removeClass( 'sbook-active', D.querySelector( '#sbook-registration-tabs .sbook-active' ) );
						
						// Hide guest/register forms
						self._removeClass( 'sbook-active',D.getElementById( 'sbook-guest-form' ) );
						self._removeClass( 'sbook-active', D.getElementById( 'sbook-signup-form' ) );

						// Focus login field
						W.setTimeout( function() {
							D.querySelector( '#sbook-signin-form .sbook-field-login' ).focus();
						}, 0 );
					});
				}
			}*/
			
			// Invoke the event
			this._invoke( 'onRegistration' );

		},

		_onSummary : function() {

			var self = this;

			// Clear booking cookies
			this._cleanup();

			// Summary can't be initial page
			if( this._initialPage === 'summary' ) {
				this.goPage( 'start' );
			}

			// Confirm cancel button
			var cancelBtn = this.$currentPage.querySelector( '.sbook-btn-cancel-book' );
			if( cancelBtn ) {
				cancelBtn.addEventListener( 'click', function(e) {
					if( !confirm( self.opts._confirmCancel ) ) {
						e.preventDefault();
						return;
					}
				});
			}

			// Invoke the event
			this._invoke( 'onSummary' );

		},

		_onCancellation : function() {

			// Clean up cookies
			this._cleanup();

			// "Cancellation" can't be initial page
			if( this._initialPage === 'cancellation' ) {
				this.goPage( 'start' );
			}

			// Invoke the event
			this._invoke( 'onCancellation' );

		},

		/**
		 * Find table.
		 */
		_findTable : function( onComplete ) {
			
			var self = this,
				$searchForm = D.getElementById('sbook-date-picker').elements,
				$results = D.getElementById( 'sbook-search-results' ),
				data = {
					restID: this._restID,
					date: this._selectedDate,
					time: this._bookTime,
					guests: this._bookGuests
				};

			self._removeClass( 'sbook-active', $results );

			// Clear notifications
			self.hideNtf();
			this._post( 'searchTable', data, function( r ) {

				if( onComplete ) {
					onComplete( r );
				}

				if( !r.success ) {
					
					self.showNtf( self.$currentPage.querySelector( '.sbook-ntf' ), r.data.msg, 'error' );
					return;
				}

				var outputTimes = '';

				// Show results
				self._addClass( 'sbook-active', $results );
				$results.querySelector( '.sbook-results' ).innerHTML = r.data.title;

				// Show times result
				for( var time in r.data.times ) {
					outputTimes += self._render( 'timeResult', { 
						restID: r.data.restID, 
						restName: r.data.restName, 
						guests: r.data.guests, 
						guestsStr: r.data.guestsStr, 
						ts: r.data.times[time].ts,
						date: r.data.times[time].date,
						time: time,
						timeStr: r.data.times[time].str,
						timeClass: ( r.data.times[time].isAvail === 1 ) ? 'sbook-avail' : 'sbook-inavail'
					});
				}
				$results.querySelector( '.sbook-result-times' ).innerHTML = outputTimes;

				// Don't go any page, just show search results
				self._onSearch();

			});
		},

		/**
		 * Prepare search form fields.
		 */
		_prepareSearchForm : function() {
			var self = this,
				$formFields = this.$currentPage.querySelector( '.sbook-date-picker' );

			// Change field values with currents
			$formFields.querySelector('.sbook-field-guests').value = this._bookGuests;
			$formFields.querySelector('.sbook-field-time').value = this._bookTime;
			if( this._bookDate ) this.datePicker.setDate( this._bookDate );

			// Listen form fields
			var fn_listen = function() {
				self._updateData( 'book'+ self._ucfirst(this.name), this.value );
			};

			if( $formFields ) {
				var el = {};
				for( var i=0; i<$formFields.elements.length; i++ ) {
					el = $formFields.elements[i];

					if( el.nodeName === 'INPUT' || el.nodeName === 'SELECT' || el.nodeName === 'TEXTAREA' ) {
						el.addEventListener( 'blur', fn_listen );
						el.addEventListener( 'change', fn_listen );
						self._trigger( 'blur', el );
					}
				}
			}
		},

		/**
		 * Get late booking time.
		 */
		_updateRest : function( restID, restName ) {
			var self = this;

			// Update restaurant data
			if( restID ) { this._updateData( 'restID', restID ); }
			if( restName ) { this._updateData( 'restName', restName ); }

			// Get allowed days
			this._workingDays = sbookOpts.rests[this._restID].workingDays;

			if( this.datePicker ) {
				this.datePicker.destroy();
			}

			this.opts.dateOpts.onSelect = function(date) {

	            var year = date.getFullYear(),
					month = date.getMonth() + 1,
					day = date.getDate();

				// ISO format (YYYY-MM-DD)
				var formattedDate = [
						year,
						month < 10 ? '0' + month : month,
						day < 10 ? '0' + day : day
					].join('-');

				// Just update selected date without adding cookies
				self._selectedDate = formattedDate;
				
			};

			// Re-initiate the date
			this.datePicker = new Pikaday( this.opts.dateOpts );			

		},

		/**
		 * Get late booking time.
		 */
		_lateBooking : function( howLate ) {
			var date = new Date();
			
			// Delay for late bookings
			howLate = howLate || 0; // hours

			// Add delay to date
			date.setHours( date.getHours() + howLate );

			var mins = date.getMinutes(),
				hours = date.getHours(),
				h = mins > 52 ? ( hours === 23 ? 0 : ++hours ) : hours,
				m = ( Math.ceil( mins/15 ) * 15) % 60;

			return [h,m];
		},

		/**
		 * Clean up cookies starts with "sbook".
		 */
		_cleanup : function( type ) {
			var cookies = D.cookie.split(';');

			if( cookies ) {

				// Clean up all application cookies
				if( !type ) {

					var isExists = -1,
						cookieName = '',
						cookie = '';
					for( var i=0; i<cookies.length; i++ ) {
						cookie = cookies[i];
						isExists = cookie.indexOf( 'sbook' );

						if( isExists ) {
							cookieName = cookie.substring( 0, cookie.indexOf( '=' ) );
							this._delCookie( cookieName );
						}
					}

				// Search results only
				} else if( type === 'search' ) {
					this._delCookie( 'sbookBookDate' );
					this._delCookie( 'sbookBookDateTs' );
					this._delCookie( 'sbookBookGuests' );
					this._delCookie( 'sbookBookGuestsStr' );

				// Booking data only
				} else if( type === 'book' ) {
					this._delCookie( 'sbookBookID' );
					this._delCookie( 'sbookBookTime' );
					this._delCookie( 'sbookBookingHash' );
				}
			}
		},

		/**
		 * Append the new callback to our list of event handlers.
		 */
		_addEventCallback : function( event_id, callback ) {
			this._events[event_id] = this._events[event_id] || [];
			this._events[event_id].push( callback );
		},

		/**
		 * Retrieve the list of event handlers for a given event id.
		 */
		_getEventCallback : function( event_id ) {
			if (this._events.hasOwnProperty(event_id)) {
				return this._events[event_id];
			}
			return [];
		},

		/**
		 * Invoke each of the event handlers for a given 
		 * event id with specified data.
		 */
		_invoke : function( event_id ) {
			var args = [],
				callbacks = this._getEventCallback( event_id );

			Array.prototype.push.apply( args, arguments );
			args = args.slice(1);

			for ( var i = 0; i < callbacks.length; i += 1 ) {
				callbacks[i].apply( null, args );
			}

		},

		/**
		 * Countdown.
		 */
		_timer : function( duration, $el ) {
			var timer = duration, min, sec;

			if( !$el ) return;

			return W.setInterval(function () {
				min = parseInt( timer / 60, 10 );
				sec = parseInt( timer % 60, 10 );

				min = min < 10 ? '0' + min : min;
				sec = sec < 10 ? '0' + sec : sec;

				$el.textContent = min + ':' + sec;

				if ( --timer < 0 ) {
					timer = duration;
				}
			}, 1000);

		},

		/**
		 * Add new class(es).
		 */
		_addClass : function( new_cls, $el ) {

			if( !$el ) return;

			this._removeClass(new_cls, $el );

			var cls = [$el.className, new_cls].join(' ');

			$el.className = cls;

		},

		/**
		 * Remove class(es).
		 */
		_removeClass : function( remove, $el ) {

			if( !$el ) return;

			var classes = remove.split( ' ' ),
			rx = '';

			for( var i=0; i < classes.length; i++ ) {
				rx = new RegExp( '(?:^|\\s)' + classes[i] + '(?!\\S)', 'g' );

				// Update class
				$el.className = $el.className.replace( rx , '' );

			}

		},

		/**
		 * Check if element has class name.
		 */
		_hasClass : function( selector, $el ) {

			var className = ' ' + selector + ' ';

			if ( ( ' ' + $el.className + ' ' ).replace( /[\n\t]/g, ' ' ).indexOf( className ) > -1 ) {
				return true;
			}
			return false;

		},

		/**
		 * Remove a DOM object.
		 */
		_removeObj : function( id ) {

			var $item = D.getElementById(id);

			if( $item ) { 
				$item.parentNode.removeChild( $item ); 
			}

		},

		/**
		 * Trigger an event.
		 */
		_trigger : function( name, $el ) {
			if ( 'createEvent' in D ) {
				var e = D.createEvent( 'HTMLEvents' );
				e.initEvent( name, false, true);
				$el.dispatchEvent(e);
			}
			else
				$el.fireEvent( 'on' + name );
		},

		/**
		 * Update specific data.
		 */
		_updateData : function( name, data ) {
			this[ '_' + name ] = data;
			name = this._ucfirst( name );
			this._addCookie( 'sbook' + name, data );
		},

		/**
		 * Make first letter uppercase.
		 */
		_ucfirst : function( str ) {
			return str.charAt(0).toUpperCase() + str.slice(1);
		},

		/**
		 * Send a post request to the server.
		 */
		_post : function( mode, data, callback ) {

			data.mode = mode;
			data.action = sbookOpts.action;
			data._ajax_nonce = sbookOpts.nonce;

			var self = this,
				xhr = new XMLHttpRequest(),
				fd = new FormData(),
				url = sbookOpts.ajaxURL;

			xhr.open( 'POST', url, true );

			// Handle response
			xhr.onreadystatechange = function() {

				if ( xhr.readyState == 4 ) {

					// Perfect!
					if( xhr.status == 200 ) {
						if( callback ) { callback( JSON.parse( xhr.responseText ) ); }

					// Something wrong!
					} else {
						if( callback ) { callback( null ); }
					}
				}

			};
			
			// Get data
			for( var k in data ) { fd.append( k, data[k] ) ; }

			// Initiate a multipart/form-data upload
			xhr.send( fd );

		},

		/**
		 * Send a get request to the server.
		 */
		_get : function( url, success, fail ) {
		
			var self = this,
				xhr = new XMLHttpRequest();

			xhr.open( 'GET', url, true );

			// Handle response
			xhr.onreadystatechange = function() {

				if ( xhr.readyState == 4 ) {

					// Perfect!
					if( xhr.status == 200 ) {
						if( success ) { success( JSON.parse( xhr.responseText ) ); }

					// Something wrong!
					} else {
						if( fail ) { fail( null ); }
					}
				}
			};
			
			// Initiate request
			xhr.send( null );

		},

		/**
		 * Render template.
		 */
		_render : function( name, p ) {
		
			var arr = [];

			switch( name ) {

				// Time
				case 'timeResult':
					arr = [ '<li class="sbook-time"><a href="#" class="',p.timeClass,'" data-rest-id="',p.restID,'" data-rest-name="',p.restName,'" data-time="',p.time,'" data-timestamp="',p.ts,'" data-guests="',p.guests,'" data-guests-str="',p.guestsStr,'" data-date="',p.date,'">', p.timeStr, '</a></li>' ];
					break;

			}

			return arr.join('');

		},

		/**
		 * Show a form.
		 */
		_showForm : function( name ) {
			var $guestForm = D.getElementById( 'sbook-guest-form' ),
				$signInForm = D.getElementById( 'sbook-signin-form' ),
				$signUpForm = D.getElementById( 'sbook-signup-form' ),
				$userForm = D.getElementById( 'sbook-user-form' );

			switch( name ) {
				case 'signin':
					// Show sign-in form
					this._addClass( 'sbook-active', $signInForm );

					// Hide other forms
					this._removeClass( 'sbook-active', $guestForm );
					this._removeClass( 'sbook-active', $signUpForm );
					this._removeClass( 'sbook-active', $userForm );
					break;

				case 'signup':
					// Show sign-up form
					this._addClass( 'sbook-active', $signUpForm );

					// Hide other forms
					this._removeClass( 'sbook-active', $guestForm );
					this._removeClass( 'sbook-active', $signInForm );
					this._removeClass( 'sbook-active', $userForm );
					break;

				case 'guestBooking':
					// Show guests form
					this._addClass( 'sbook-active', $guestForm );

					// Hide other forms
					this._removeClass( 'sbook-active', $signUpForm );
					this._removeClass( 'sbook-active', $signInForm );
					this._removeClass( 'sbook-active', $userForm );
					break;

				case 'userBooking':
					// Show guests form
					this._addClass( 'sbook-active', $userForm );

					// Hide other forms
					this._removeClass( 'sbook-active', $signUpForm );
					this._removeClass( 'sbook-active', $signInForm );
					this._removeClass( 'sbook-active', $guestForm );
					break;
			}
		},

		/**
		 * Update related form fields on current page.
		 */
		_autoFillCurrentForm : function() {

			if( this._currentUser ) {
				var $fields = {};
				var user = JSON.parse( this._currentUser );

				for( var k in user ) {
					$fields = this.$currentPage.getElementsByClassName( 'sbook-field-' + k );
					if( $fields && user[k] ) {
						for( var i=0; i<$fields.length; i++ ) {
							$fields[i].value =  user[k];
						}
						
					}
				}
			}

		},

		/**
		 * Create new cookie.
		 */
		_addCookie : function( name, value, days ) {
			if ( days ) {
				var date = new Date();
				date.setTime( date.getTime() + ( days * 24 * 60 * 60 * 1000 ) );
				var expires = "; expires="+date.toUTCString();
			} else var expires = "";

			D.cookie = name + "=" + value + expires + "; path=/";
		},

		/**
		 * Read a cookie.
		 */
		_getCookie : function( name ) {
			var nameEQ = name + "=";
			var ca = D.cookie.split(';');
			for( var i=0; i < ca.length; i++ ) {
				var c = ca[i];
				while ( c.charAt(0) == ' ' ) c = c.substring( 1, c.length );
				if ( c.indexOf( nameEQ ) == 0) return c.substring( nameEQ.length,c.length );
			}
			return null;
		},

		/**
		 * Delete a cookie.
		 */
		_delCookie : function( name ) {
			this._addCookie( name, "", -1 );
		}

	};

	// Run the script in "noConflict" mode
	BookTable.noConflict = function noConflict() {
		root.BookTable = prev_sbook;
		return BookTable;
	};

	// Export the object as global
	root.BookTable = BookTable;

	/**
	 * Initiate the application.
	 */
	BookTable.prototype.init = function() {
		this._init();
	};

	/**
	 * Go to a page.
	 */
	BookTable.prototype.goPage = function( pageID ) {
		var $page = D.getElementById( 'sbook-page-' + pageID );
		this._removeClass( 'sbook-active', this.$currentPage );
		this._addClass( 'sbook-active', $page );

		// Update current page
		this._currentPage = pageID;
		this.$currentPage = $page;

		// Update cookie
		this._addCookie( 'sbookCurrentPage', pageID );

		// Invoke the related function
		this[ '_on' + this._ucfirst( pageID ) ]();
	};

	/**
	 * Show a notification.
	 */
	BookTable.prototype.showNtf = function( $el, msg, type ) {
		if( $el ) {
			this._addClass( 'sbook-' + type + '  sbook-active', $el );
			$el.innerHTML = msg;
		}

	};

	/**
	 * Hide notification on current popup page.
	 */
	BookTable.prototype.hideNtf = function() {
		var $ntf = this.$currentPage.querySelectorAll( '.sbook-ntf' );

		if( $ntf ) {
			for( var i=0; i<$ntf.length; i++ ) {
				this._removeClass( 'sbook-error sbook-success sbook-warning sbook-active', $ntf[i] );
				$ntf[i].innerHTML = '';
			}
		}
	};

	/**
	 * Update popup state (open, close, etc..
	 */
	BookTable.prototype.updateState = function( state ) {
		this._State.process( state );

		// Update cookie
		this._addCookie( 'sbookState', state );
	};

	/**
	 * Callback registration. Supports each of the following events.
	 *
	 * onOpen, onClose, onMinimize, onSending, onSuccess, onFail
	 */
	BookTable.prototype.on = function( event_type, callback ) {
		this._addEventCallback( event_type, callback );
	};

})();