
	var interleaveOffset = -.5;
	var interleaveEffect = {
		
		onProgress: function(swiper, progress)
		{
			for (var i = 0; i < swiper.slides.length; i++)
			{
				var slide = swiper.slides[i];
				var translate, innerTranslate;
					progress = slide.progress;
	      
				if (progress > 0) {
					translate = progress * swiper.width;
					innerTranslate = translate * interleaveOffset;        
				}
				else {        
					innerTranslate = Math.abs( progress * swiper.width ) * interleaveOffset;
					translate = 0;
				}
	
				$(slide).css({
					transform: 'translate3d(' + translate + 'px,0,0)'
				});
	
				$(slide).find('.image').css({
					transform: 'translate3d(' + innerTranslate + 'px,0,0)'
				});
			}
		},
		
		onTouchStart: function(swiper)
		{
			for (var i = 0; i < swiper.slides.length; i++) {
				$(swiper.slides[i]).css({ transition: '' });
			}
		},
		
		onSetTransition: function(swiper, speed)
		{
			for (var i = 0; i < swiper.slides.length; i++)
			{
				$(swiper.slides[i])
					.find('.image')
					.andSelf()
					.css({ 'transition-duration': speed + 'ms' });
			}
		}
	  
	};	

	$(document).ready(function(){
		
		/*	Helpers & event handlers
        -----------------------------------------------*/

            // Animated links
      		$('a[href^="#"][href!="#"]').on('click', function(e) {
    			e.preventDefault();
    			$('body').removeClass('show-mobile-menu');
    			$('html, body').stop().animate({ 'scrollTop': $(this.hash).offset().top }, 1000, 'swing');
    		});
            
            // External links
    	    $('a[rel="external"]').click(function(){
    		   window.open(this.href);
    		   return false;
    	    });
    	    
    	    // Developer mode
    	    /*$('.sbook-action-btn').on('click', function(e) {
    			e.preventDefault();
    			$('.sbook, .sbook-page').toggleClass('sbook-active');
    		});*/
    		
    		// Mobile trigger
    		$('.mobile-trigger').click(function(){
	    		$('body').toggleClass('show-mobile-menu');
    		});
    		
    		// Submenu
		    $('.menu-item-has-children > a').click(function(){
			  	$(this.parentNode).find('.sub-menu').slideToggle();
			  	return false;
		    });
		    
		    // Touch device?
		    if( isTouchDevice() ){
				$('body').addClass('is-mobile');
		    }
		    
		    // Close popup
		    $(document).on('click', function(e){
			    var el = $(e.target);
				if( !el.hasClass('box') && !el.parents('.box').length ){
					$('.booking-container').fadeOut();
				}
		    });
    	    
    	    
		/*	Swipers
        -----------------------------------------------*/ 
		
			// Gallery
            if( $('.section-intro .swiper-container').length )
            {
            	var swiper = new Swiper('.section-intro .swiper-container', $.extend({
	            	loop: true,
                    speed: 1000,
                    autoplay: 3000,
                    watchSlidesProgress: true,
                    nextButton: '.section-intro .nav.next',
        			prevButton: '.section-intro .nav.prev',
                    pagination: '.section-intro .swiper-pagination',
                    paginationClickable: true
                }, interleaveEffect));
        	} 
        
        	// Gallery
            if( $('.section-gallery .swiper-container').length )
            {
            	var swiper = new Swiper('.section-gallery .swiper-container', $.extend({
	            	loop: true,
                    speed: 1000,
                    watchSlidesProgress: true,
                    nextButton: '.section-gallery .nav.next',
        			prevButton: '.section-gallery .nav.prev',
                    pagination: '.section-gallery .swiper-pagination',
                    paginationClickable: true
                }, interleaveEffect));
        	}
		
		
		/*	Gravity Forms
        -----------------------------------------------*/ 
        
			$(document).bind('gform_post_render', function(event, form_id){
				
				disableBodyScroll();
				
				// Timepicker
				$('.field-time input').timepicker({
	                minTime: '05:30pm',
	                maxTime: '11:00pm',
	                step: '15',
					timeFormat: 'h:i A'
	            });
	            
	            $('.field-time input').on('blur', function(e){
	            	$(this).timepicker('hide');
	            });
	            
	            // Datepicker select
	            gform_datepicker_select('', {
		            currentYear: new Date().getFullYear(),
		            currentMonth: new Date().getMonth(),
		            currentDay: new Date().getDate()
	            });  
	            
	            // Datepicker
	            $('.field-date input').on('blur', function(e){
	            	$(this).datepicker('hide');
	            });
				
			});
			
			if( typeof(gform) != 'undefined' )
			{
				gform.addFilter('gform_datepicker_options_pre_init', function(optionsObj, formId, fieldId){
					optionsObj.onSelect = gform_datepicker_select;
					optionsObj.changeYear = false;
					optionsObj.changeMonth = false;
				    return optionsObj;
				});
			}
		
	});
	
	
	/*
	 *	Is touch device?
	 */		
	function isTouchDevice() {
		return true == ("ontouchstart" in window || window.DocumentTouch && document instanceof DocumentTouch);
	}
	
	
	/*
	 *	Datepicker select
	 */
	function gform_datepicker_select(dateString, obj)
	{		
		var d = new Date();
		var todayDate = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()
		var selectedDate = obj.currentYear+'-'+(obj.currentMonth+1)+'-'+obj.currentDay;
		var dateObj = new Date(obj.currentYear, obj.currentMonth, obj.currentDay); 
		var dayNum = dateObj.getDay();
		
		$('.field-time input').val('');
	
		var openings = [
			//[['05:30pm', '06:00pm']],
			[],
			[],
			[],
			[],
			[],
			[],
			[]
		]
		
		// Weekends
		if( dayNum == 0 || dayNum == 5 ){			
			$('.field-time input').timepicker('option', 'minTime', '05:30pm');	
		}
		else {
			$('.field-time input').timepicker('option', 'minTime', '06:00pm');
		}
		
		// Today
		if( todayDate == selectedDate )
		{						
			var startHour = d.getHours()+2;
			var startMin = d.getMinutes();
			var disableThese = openings[dayNum];
			disableThese.push(['05:30pm', startHour+':'+(startMin<10 ? '0'+startMin : startMin)]);
				
			$('.field-time input').timepicker('option', 'disableTimeRanges', disableThese);									
		}
		else
		{
			var disableThese = openings[dayNum];				
			$('.field-time input').timepicker('option', 'disableTimeRanges', disableThese);			
		}	
	}
	
	
	/*
	 *	Disable scroll body
	 */
	function disableBodyScroll()
	{
		var $body = $(window.document.body);
		var bodyWidth = $body.innerWidth();
		$body.css('overflow', 'hidden');
		$body.css('marginRight', ($body.css('marginRight') ? '+=' : '') + ($body.innerWidth() - bodyWidth))
	}
	
	
	/*
	 *	Enable scroll body
	 */
	function enableBodyScroll()
	{
		var $body = $(window.document.body);
		var bodyWidth = $body.innerWidth();
		$body.css('marginRight', '-=' + (bodyWidth - $body.innerWidth()))
		$body.css('overflow', 'auto');
	}
