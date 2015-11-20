/*:
 * =============================================================================
 * Iavra Generic Popup.js
 * =============================================================================
 *
 * @plugindesc Allows to display generic popups messages on the screen.
 * <Iavra Generic Popup>
 * @author Iavra
 *
 * @param Display On Scene
 * @desc A comma-separated list of scenes where popups are allowed.
 * @default Scene_Map, Scene_Menu
 *
 * @help
 * To display a new popup, call the following function:
 * 
 * IAVRA.POPUP.popup(text, options, callbacks);
 *
 * Where "text" is the text to be displayed, "options" is an optional object to override some or all of the default
 * options and "callbacks" is an optional object to override some or all of the default callbacks. Any escape characters
 * can be used inside the "text" parameter, but most will need to have their backslashes doubled.
 * 
 * The following options can be specified:
 * 
 * width         Width of the popup window. It's height will be autofit to its content. Default: 200
 * duration      How long the popup should be visible. The update callback can choose to ignore this value. Default: 100
 * lineHeight    Overwrite lineHeight() in Window_Base, use default if empty. Default: (empty)
 * fontName      Overwrite standardFontFace() in Window_Base, use default if empty. Default: (empty)
 * fontSize      Overwrite standardFontSize() in Window_Base, use default if empty. Default: (empty)
 * padding       Overwrite standardPadding() in Window_Base, use default if empty. Default: (empty)
 * textPadding   Overwrite textPadding() in Window_Base, use default if empty. Default: (empty)
 * backOpacity   Overwrite standardBackOpacity() in Window_Base, use default if empty. Default: (empty)
 * windowskin    Overwrite loadWindowskin() in Window_Base, use default if empty. Default: (empty)
 * scenes        Takes an array of scene classes and overwrites the value specified in "Display On Scene".
 *
 * The following callbacks can be specified:
 * 
 * init(popup)   Called after the popup has been created, but before text has been drawn on it.
 * update(popup) Called every frame. If this function returns a falsy value, the popup is removed. It has access to the
 *               popup duration and can either work with or ignore it.
 * remove(popup) Called when the popup is removed either by running out, clear() or because update() returned false.
 *
 * To clear all popups, call the following function:
 *
 * IAVRA.POPUP.clear();
 */

var Imported = Imported || {};
Imported.iavra_generic_popup = true;

//=============================================================================
// namespace IAVRA
//=============================================================================

var IAVRA = IAVRA || {};

(function() {
    "use strict";
    
    /**
     * Since PluginManager.parameters() breaks when the plugin file is renamed, we are using our own solution.
     */
    var _params = $plugins.filter(function(p) { return p.description.contains('<Iavra Generic Popup>'); })[0].parameters;
    
    /**
     * All scenes where popups should be displayed. Whenever a scene gets active that isn't in this list, all popups
     * will be removed.
     */
    var _displayOnScene = _params['Display On Scene'].split(/\s*,\s*/).filter(function(scene) {
        return !!scene;
    }).map(function(scene) { return eval(scene); });
    
    /**
     * Default options to be used when a new popup is created. Can be overwritten for every popup by passing an object
     * containing some or all of the keys.
     */
    var _defaultOptions = {
        width: 200, 
        duration: 100, 
        lineHeight: undefined,
        fontName: undefined, 
        fontSize: undefined, 
        padding: undefined, 
        textPadding: undefined, 
        backOpacity: undefined, 
        windowskin: undefined,
        scenes: _displayOnScene
    };
    
    /**
     * Default callbacks to be used. Can be overwritten for every popup by passing an object containing some or all of
     * the keys.
     */
    var _defaultCallbacks = {
        init: function(popup) {}, 
        update: function(popup) { return popup.duration-- > 0; },
        remove: function(popup) {}
    };
    
    /**
     * MV's WindowLayer has issues with windows that are overlapping each other, so we use Pixi's base class directly.
     * We declare the following methods on the container:
     * update()      Calls update() on all popups. Integrates the container in MV's engine.
     * remove(popup) Removes a popup from the container and calls its "remove()" callback, if any.
     * clear()       Removes all popups from the container and calls their "remove()" callbacks, if any.
     */
    var _container = (function($) {
    
        $.update = function() { 
            this.children.forEach(function(popup) { popup.update(); }); 
        };
        
        $.remove = function(popup) {
            popup._callbacks.remove(popup);
            this.removeChild(popup);
        };
        
        $.clear = function() {
            this.children.forEach(function(popup) { popup._callbacks.remove(popup); });
            this.removeChildren();
        };
        
        return $;
    })(new PIXI.DisplayObjectContainer());
    
    /**
     * Utility function that takes 2 objects and iterates over all keys in the first one. If the second object contains
     * that key, its value is taken, otherwise we take the default. The result is merged to a new object and returned.
     */
    var mergeOptions = function(defaults, options) {
        options || (options = {});
        return Object.keys(defaults).reduce(function(map, key) {
            map[key] = options[key] !== undefined ? options[key] : defaults[key];
            return map;
        }, {});
    };
    
    //=============================================================================
    // module IAVRA.POPUP
    //=============================================================================
    
    IAVRA.POPUP = {
        
        /**
         * Adds a new popup with the given text to the container. "options" and "callbacks" are optional objects, that can
         * be used to overwrite the default options and callbacks. 
         */
        popup: function(text, options, callbacks) {
            _container.addChild(new IAVRA.POPUP.Window_Popup(text, options, callbacks));
        }, 
        
        /**
         * Clears all popups, calling their "remove()" callbacks, if specified.
         */
        clear: function() {
            _container.clear();
        }
        
    };
    
    //=============================================================================
    // class IAVRA.POPUP.Window_Popup
    //=============================================================================
    
    IAVRA.POPUP.Window_Popup = function() { this.initialize.apply(this, arguments); };
    (function($) {
        ($.prototype = Object.create(Window_Base.prototype)).constructor = $;
    
        /**
         * Creates a new popup window. The given options and callbacks (if any) are merged with the default values and the
         * popup height is calculated by splitting the given text at newlines.
         */
        $.prototype.initialize = function(text, options, callbacks) {
            this._options = mergeOptions(_defaultOptions, options);
            this._callbacks = mergeOptions(_defaultCallbacks, callbacks);
            var height = this.fittingHeight(text.split('\n').length);
            Window_Base.prototype.initialize.call(this, 0, 0, this._options.width, height);
            this._callbacks.init(this);
            this.drawTextEx(text, 0, 0);
        };
        
        /**
         * Calls the update callback and decreases the popup duration by one. If either the callback returns false or the
         * duration has run out, the popup is removed. It's up to the callback to handle any kind of fading or positioning
         * needed.
         */
        $.prototype.update = function() {
            Window_Base.prototype.update.call(this);
            this._callbacks.update(this) || _container.remove(this);
        };
        
        /**
         * Accessor for the duration of the popup.
         */
        Object.defineProperty($.prototype, 'duration', {
            get: function() { return this._options.duration; },
            set: function(value) { this._options.duration = value; }
        });
        
        /**
         * Overwrite lineHeight
         */
        $.prototype.lineHeight = function() {
            return this._options.lineHeight !== undefined ? this._options.lineHeight : Window_Base.prototype.lineHeight.call(this);
        };
        
        /**
         * Overwrite standardFontFace
         */
        $.prototype.standardFontFace = function() {
            return this._options.fontName !== undefined ? this._options.fontName : Window_Base.prototype.standardFontFace.call(this);
        };
        
        /**
         * Overwrite standardFontSize
         */
        $.prototype.standardFontSize = function() {
            return this._options.fontSize !== undefined ? this._options.fontSize : Window_Base.prototype.standardFontSize.call(this);
        };
        
        /**
         * Overwrite standardPadding
         */
        $.prototype.standardPadding = function() {
            return this._options.padding !== undefined ? this._options.padding : Window_Base.prototype.standardPadding.call(this);
        };
        
        /**
         * Overwrite textPadding
         */
        $.prototype.textPadding = function() {
            return this._options.textPadding !== undefined ? this._options.textPadding : Window_Base.prototype.textPadding.call(this);
        };
        
        /**
         * Overwrite standardBackOpacity
         */
        $.prototype.standardBackOpacity = function() {
            return this._options.backOpacity !== undefined ? this._options.backOpacity : Window_Base.prototype.standardBackOpacity.call(this);
        };
        
        /**
         * Overwrite loadWindowskin
         */
        $.prototype.loadWindowskin = function() {
            if(this._options.windowskin !== undefined) {
                this.windowskin = ImageManager.load(this._options.windowskin);
            } else {
                Window_Base.prototype.loadWindowskin.call(this);
            }
        };
        
        return $;
    })(IAVRA.POPUP.Window_Popup);
    
    //=============================================================================
    // class Scene_Base
    //=============================================================================
    
    (function($) {
        
        /**
         * Registering our container in every scene, on top of regular windows.
         */
        var _alias_createWindowLayer = $.prototype.createWindowLayer;
        $.prototype.createWindowLayer = function() {
            _alias_createWindowLayer.apply(this, arguments);
            this.addChild(_container);
        };
        
        /**
         * When terminating the scene, we remove all popups, that shouldn't be displayed on the next scene.
         */
        var _alias_terminate = $.prototype.terminate;
        $.prototype.terminate = function() {
            _alias_terminate.apply(this, arguments);
            _container.children.forEach(function(popup) {
                popup._options.scenes.some(function(scene) { return SceneManager.isNextScene(scene); }) || _container.remove(popup);
            });
        };
        
    })(Scene_Base);
    
    //=============================================================================
    // module SceneManager
    //=============================================================================
    
    (function($) {
        
        /**
         * We don't want popups to appear on background images, since they are either removed by Scene_Base.terminate() or
         * will probably fade our while the background still shows them. So we hide the container during the snapshot.
         */
        var _alias_snapForBackground = $.snapForBackground;
        $.snapForBackground = function() {
            _container.visible = false;
            _alias_snapForBackground.apply(this, arguments);
            _container.visible = true;
        };
        
    })(SceneManager);
    
})();
