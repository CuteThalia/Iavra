/*:
 * =============================================================================
 * Iavra Animate Everything.js
 * =============================================================================
 *
 * @plugindesc Provides a generic way to animate every float property on every object.
 * <Iavra Animate Everything>
 * @author Iavra
 *
 * @param Enable Persistence
 * @desc If set to true, running animations will be stored in the savefile and continued after loading.
 * @default false
 *
 * @help
 * To animate an object a new Tween has to be created and started like this:
 * var myTween = new IAVRA.ANIMATE.Tween(object, {_x : 100}).duration(50).start();
 *
 * This will cause the property "_x" of "object" to change from its current value to 100 over the next
 * 50 frames, using linear easing (default).
 *
 * The IAVRA.ANIMATE.Tween class contains the following functions:
 * 
 * start()              Starts the animation.
 * stop()               Stops the animation. It can be restarted, but the current progress isn't saved.
 * pause()              Pauses the animation. It can be resumed at any time by calling resume().
 * resume()             Resumes the animation that has previously been pause()-d.
 * easing(easing)       Specified the easing function to be used by the tween. By default, linear (no)
 *                      easing is used. An easing function takes a single parameter k, which is defined as
 *                      t/d, meaning "current animation step" / "total duration" and can range from 0.0 to
 *                      1.0. It must return a value of X, which will be used to calculate the current
 *                      value as: start + (end - start) * X.
 * duration(duration)   Sets the animation duration. The default value is 1 and causes the animation to
 *                      complete instantly. Values lower than 1 will throw an error.
 * delay(delay)         Causes the animation to pause for a given number of steps and can either be used
 *                      to delay the start of the animation or to pause it during its execution. Values
 *                      lower than 1 have no effect.
 * onStart(callback)    Registers a callback, which will be invoked when the animation starts.
 *                      The callback receives the animated object as a parameter.
 * onUpdate(callback)   Registers a callback, which will be invoked when the animation proceeds
 *                      by one step. The callback receives the animated object as a parameter.
 * onComplete(callback) Registers a callback, which will be invoked when the animation completes.
 *                      The callback receives the animated object as a parameter.
 * onStop(callback)     Registers a callback, which will be invoked when the tween's stop() function is
 *                      called. The callback receives the animated object as a parameter.
 * chain(...)           Takes any number of IAVRA.ANIMATE.TWEEN objects, that will be started once this
 *                      animation completes. Please ensure not to call start() on the chained objects, as
 *                      this would cause them to be started twice.
 * access(get, set)     Takes 2 callback functions, that will be used to read and write properties on the
 *                      object being animated. The get callback takes 2 parameters, the object and name
 *                      of the property being read. The set callback takes 3 parameters, the object, the
 *                      name of the property to write and the value it should be set to.
 *
 * All functions return the Tween object itself and can be used for chaining.
 *
 * The IAVRA.ANIMATE module contains the following functions:
 *
 * clear()              Forcefully stops all currently running animations without triggering callbacks or
 *                      starting chained tweens.
 *
 * By default, animations are saved locally and get lost after saving and loading the game. The parameter
 * "Enable Persistence" changes this and stores all animations in the savefile. Note that JSON.stringify()
 * (which MV uses as its save mechanism) discards functions, which means that registered callbacks are lost
 * after loading a game.
 */

var Imported = Imported || {};
Imported["iavra_animate"] = true;

//=============================================================================
// namespace IAVRA
//=============================================================================

var IAVRA = IAVRA || {};

(function() {
    "use strict";

    /**
     * Loads plugin parameters. We are using our own solutions which bypasses the
     * PluginManager, but is independent from the actual filename.
     * 
     */
    var params = (function($) {
        return {
            enablePersistence: $['Enable Persistence'].toLowerCase() === 'true'
        };
    })($plugins.filter(function(plugin) {
        return plugin.description.indexOf('<Iavra Animate Everything>') != -1;
    })[0].parameters);
  
    /**
     * Depending on the "Enable Persistence" parameter, we either store tweens locally
     * or in $gameSystem.
     */
    var getTweens;
    if(params.enablePersistence) {
        getTweens = function() {
            return $gameSystem.iavra_animate_tweens;
        };
    } else {
        var _tweens = [];
        getTweens = function() {
            return _tweens;
        }
    }
    
    /**
     * Adds a new tween.
     */
    var addTween = function(tween) {
        getTweens().push(tween);
    };
    
    /**
     * Removes a tween.
     */
    var removeTween = function(tween) {
        var index = getTweens().indexOf(tween);
        if(index !== -1) {
            getTweens().splice(index, 1);
        }
    };
    
    //=============================================================================
    // namespace IAVRA.ANIMATE
    //=============================================================================
    
    IAVRA.ANIMATE = {
        
        /**
        * Deletes all tweens, effectively stopping them (but without triggering any
        * existing callbacks).
        */
        clear: function() {
            getTweens().splice(0, getTweens().length);
        },
        
        /**
        * Updates all registered tweens, deleting those from the array whose update()-
        * function return false.
        */
        update: function() {
            for(var index = getTweens().length - 1; index >= 0; index--) {
                if (!getTweens()[index].update()) { 
                    getTweens().splice(index, 1);
                }
            }
        },
        
        /**
        * Default callbacks to be used for accessing properties on objects. Can be
        * overridden to alter the default behaviour. For single tweens, the function
        * access(getCallback, setCallback) can be used to provide custom functions.
        */
        defaultCallbacks: {
            propertyGet: function(object, property) {
                return object[property] || 0;
            },
            propertySet: function(object, property, value) {
                object[property] = value;
            }
        }        
    };
    
    //=============================================================================
    // class IAVRA.ANIMATE.Tween
    //=============================================================================
    
    IAVRA.ANIMATE.Tween = (function($) {
        
        /**
         * Initializes a new tween, which holds the animated object and handles the
         * actual animation process.
         */
        $.prototype.initialize = function(object, properties) {
            this._object = object;
            this._time = 0;
            this._duration = 1;
            this._delay = 0;
            this._easing = IAVRA.EASING.linear;
            
            this._running = false;
            
            this._valueGetCallback = IAVRA.ANIMATE.defaultCallbacks.propertyGet;
            this._valueSetCallback = IAVRA.ANIMATE.defaultCallbacks.propertySet;
            
            this._valuesStart = {};
            this._valuesEnd = properties || {};
            
            this._chainedTweens = [];
        };
        
        /**
         * Initializes all start values, calls the onStartCallback, if any, and adds
         * this tween to the module.
         */
        $.prototype.start = function() {
            this._running = true;
            this._time = 0;
            for(var prop in this._valuesEnd) {
                this._valuesStart[prop] = parseFloat(this._valueGetCallback(this._object, prop));
            }
            if(this._onStartCallback !== undefined) {
                this._onStartCallback(this._object);
            }
            addTween(this);
            return this;
        };
        
        /**
         * Removes this tween and all chained tweens from the module and calls the
         * onStopCallback, if any.
         */
        $.prototype.stop = function() {
            removeTween(this);
            this._running = false;
            if(this._onStopCallback !== undefined) {
                this._onStopCallback(this._object);
            }
            this._chainedTweens.forEach(function(tween) {
                tween.stop();
            });
            return this;
        };
        
        /**
         * Pauses execution of this tween until resume() is called.
         */
        $.prototype.pause = function() {
            this._running = false;
            return this;
        };
        
        /**
         * Resumes execution of a tween, that has been pause()-d.
         */
        $.prototype.resume = function() {
            this._running = true;
            return this;
        };
        
        /**
         * Specifies the easing function to be used by this tween. By default, every
         * tween uses linear (no) easing.
         */
        $.prototype.easing = function(easing) {
            this._easing = easing;
            return this;
        };
        
        /**
         * Sets the duration to be used for this tween. If this method is not called,
         * the default value of 1 is used instead (which means, the animation finishes
         * instantly).
         */
        $.prototype.duration = function(value) {
            if((this._duration = parseInt(value)) < 1) {
                throw new Error('Duration has to be higher than 0.');
            }
            return this;
        };
        
        /**
         * Delays execution of this tween for a certain number of steps. Values lower
         * or equal 0 have no effect.
         */
        $.prototype.delay = function(value) {
            this._delay = parseInt(value);
            return this;
        };
        
        /**
         * Registers a callback to be executed when the tween is started by calling the
         * start()-function. The callback receives the animated object as a parameter.
         */
        $.prototype.onStart = function(callback) {
            this._onStartCallback = callback;
            return this;
        };
        
        /**
         * Registers a callback to be executed when the update()-method of this tween
         * is called. The callback receives the animated object as a parameter.
         */
        $.prototype.onUpdate = function(callback) {
            this._onUpdateCallback = callback;
            return this;
        };
        
        /**
         * Registers a callback to be executed when the tween completes. The callback
         * receives the animated object as a parameter.
         */
        $.prototype.onComplete = function(callback) {
            this._onCompleteCallback = callback;
            return this;
        };
        
        /**
         * Registers a callback to be executed when the tween is stopped by calling the
         * stop()-function. The callback receives the animated object as a parameter.
         */
        $.prototype.onStop = function(callback) {
            this._onStopCallback = callback;
            return this;
        }
        
        /**
         * Adds the given tweens as chained tweens, which will be executed after this
         * tween has been completed. Note that stopping a tween will also stop all
         * chained tweens.
         */
        $.prototype.chain = function() {
            this._chainedTweens = Array.prototype.slice.call(arguments);
            return this;
        }
        
        /**
         * By default the script will read and write properties directly on the object.
         * This might not always be desirable, as there could exist setters that contain
         * properties in a specific value range or similar. In this case, the method can
         * be called to provide callbacks for getting and setting properties.
         */
        $.prototype.access = function(getCallback, setCallback) {
            this._valueGetCallback = getCallback;
            this._valueSetCallback = setCallback;
            return this;
        }
        
        /**
         * Progress the tween by incrementing the _time variable and calculating the
         * new values of all given properties. Callbacks (onStart/onComplete) are called,
         * if given. If the animation completes, all chained tweens (if any) are started.
         * Returns false, when this tween has finished its execution.
         */
        $.prototype.update = function() {
            if(!this._running || --this._delay >= 0) {
                return true;
            }
            var complete = (++this._time >= this._duration);
            var progress = complete ? 1.0 : parseFloat(this._easing(this._time / this._duration));
            for(var property in this._valuesEnd) {
                var start = this._valuesStart[property];
                var end = this._valuesEnd[property];
                this._valueSetCallback(this._object, property, start + (end - start) * progress);
            }
            if(this._onUpdateCallback !== undefined) {
                this._onUpdateCallback(this._object);
            }
            if(complete) {
                if(this._onCompleteCallback !== undefined) {
                    this._onCompleteCallback(this._object);
                }
                this._chainedTweens.forEach(function(tween) {
                    tween.start();
                });
            }
            return !complete;
        }
        
        return $;
    })(function() { this.initialize.apply(this, arguments); });
    
    //=============================================================================
    // module IAVRA.EASING
    //=============================================================================
    
    IAVRA.EASING = (function($) {
        
        /**
        * Linear (no) easing. Other functions can be provided, but the script only ships
        * with this one to not bloat it with functions.
        */
        $.linear = function(k) {
            return k;
        }
        
        return $;
    })(IAVRA.EASING || {});
    
    //=============================================================================
    // class Game_System
    //=============================================================================
    
    /**
     * Defining a new property that will be used to store currently executing tweens.
     */
    Object.defineProperty(Game_System.prototype, 'iavra_animate_tweens', {
        get: function() {
            this._iavra_animate_tweens || (this._iavra_animate_tweens = []);
            return this._iavra_animate_tweens;
        }
    });
    
    //=============================================================================
    // class Scene_Base
    //=============================================================================
    
    /**
     * Hooking our own update()-function into every scene, to be as generic as possible.
     */
    var _scene_base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        IAVRA.ANIMATE.update();
        _scene_base_update.call(this, arguments);
    };
    
})();
