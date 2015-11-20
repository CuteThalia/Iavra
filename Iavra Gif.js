/*:
 * @plugindesc Allows the usage of animated images (like Gifs), which are present in form of an image strip.
 * <Iavra Gif>
 * @author Iavra
 *
 * @param File Name Format
 * @desc Used as an identifier for animated images. We capture the number of frames and the update rate of the animation.
 * @default _animated_(\d+)_(\d+)
 *
 * @help
 * Allows the usage of animated images in RMMV. They have to be converted to image strips beforehand, which is an image
 * with the dimensions [(frame width * number of frames) x (frame height)] (width x height). So, if you have an image with
 * dimensions of [50x60] and 4 animation frames, the resulting strip will be [200x60] and consist of all 4 frames in a
 * row.
 *
 * The image has to be named in a certain way, so the plugin knows which images it needs to animate. When using the default
 * value for the parameter "File Name Format", the strip above could be named "myImage_animated_4_100.png". The last number
 * tells the plugin, how fast the animation should be played. In this case, we change the displayed image every 100 frames.
 *
 * The plugin has been tested for simple pictures, characters and battle background and works even when tinting them.
 */

var Imported = Imported || {};
Imported.iavra_gif = true;

//=============================================================================
// namespace IAVRA
//=============================================================================

var IAVRA = IAVRA || {};

(function() {
    "use strict";
    
    /**
     * Since PluginManager.parameters() breaks when the plugin file is renamed, we are using our own solution.
     */
    var _params = (function($) {
        return {
            fileFormat: new RegExp($['File Name Format'])
        };
    })($plugins.filter(function(p) { return p.description.contains('<Iavra Gif>'); })[0].parameters);
    
    /**
    * This property actually overrides the "_bitmap" attribute on the sprite class, which itself is used by the "bitmap"
    * property. This way we actually intercept all access to an internal variable of a class. We use the same override
    * for Sprite and TilingSprite, so it has been outsourced to its own function.
    */
    var defineBitmapProperty = function(spriteClass) {
        Object.defineProperty(spriteClass.prototype, '_bitmap', {
            /**
             * When the bitmap object of a sprite is accessed, we determine if it's animated and return the actual
             * Bitmap object of the current animation frame.
             */
            get: function() {
                if(this._iavra_gif.gif && this._iavra_gif.gif.constructor === IAVRA.GIF.Gif) {
                    return this._iavra_gif.gif._frames[this._iavra_gif.currentFrame];
                } else {
                    return this._iavra_gif.gif;
                }
            },
            /**
             * When setting the bitmap object on a sprite, we also reset its current frame and animation timer, so we
             * can start the animation from the beginning.
             */
            set: function(value) {
                this._iavra_gif = { gif: value, currentFrame: 0, timer: 0 };
            }
        });
    };
    
    //=============================================================================
    // namespace IAVRA.GIF
    //=============================================================================
    
    IAVRA.GIF = {};
    
    //=============================================================================
    // class IAVRA.GIF.Gif
    //=============================================================================
    
    IAVRA.GIF.Gif = function() {};
    (function($) {
        $.prototype.constructor = $;
        
        /**
         * When loading an image, we determine how many frames it has and create that many Bitmap objects. The rest works
         * similar to a normal Bitmap, since we first have to wait for the image to load before we can continue.
         */
        $.load = function(url, params) {
            var gif = new IAVRA.GIF.Gif();
            gif._numFrames = parseInt(params[1]) || 1;
            gif._frameRate = parseInt(params[2]) || 0;
            gif._frames = [];
            for(var index = 0; index < gif._numFrames; ++index) {
                var bitmap = new Bitmap();
                bitmap._isLoading = true;
                gif._frames.push(bitmap);
            }
            gif._image = new Image();
            gif._image.src = url;
            gif._image.onload = IAVRA.GIF.Gif.prototype._onLoad.bind(gif);
            gif._image.onerror = IAVRA.GIF.Gif.prototype._onError.bind(gif);
            gif._image._url = url;
            return gif;
        };
        
        /**
         * When the image is loaded, we iterate over the Bitmap objects previously created and create a new canvas for
         * each one. This is used to split the loaded image in multiple smaller ones. This way, sprites only ever see with
         * a single animation frame and this can actually work with TilingSprite (i hate you).
         */
        $.prototype._onLoad = function() {
            this._frames.forEach(function(bitmap, index) {
                // Calculate the width of a single frame and create a new canvas object for every Bitmap. This is used to
                // draw the actual animation frame of the Bitmap.
                var frameWidth = this._image.width / this._numFrames;
                var canvas = document.createElement('canvas');
                var context = canvas.getContext('2d');
                canvas.width = frameWidth;
                canvas.height = Math.max(this._image.height || 0, 1);
                context.drawImage(this._image, -index * frameWidth, 0);
                // This is basically the same as Bitmap.prototype._onLoad(), only that we aren't using the loaded image
                // directly to draw the bitmap, but our canvas object.
                bitmap._isLoading = false;
                bitmap.resize(frameWidth, this._image.height);
                bitmap._context.drawImage(canvas, 0, 0);
                bitmap._setDirty();
                bitmap._callLoadListeners();
            }, this);
        };
        
        /**
         * If there was an error loading the image, we execute the _onError() callback on every contained Bitmap.
         */
        $.prototype._onError = function() {
            this._frames.forEach(function(bitmap) { bitmap._onError(); });
        };
        
        /**
         * These functions are needed for the ImageManager, since it's the only class in the entire engine that actually
         * interacts with the container, instead of one of it's Bitmap children. Overring the last 2 functions with empty
         * ones actually seems to do nothing. I tried to propagate listeners to all frames, but it didn't change anything,
         * so i'll just leave it at this.
         */
        $.prototype.isReady = function() { return this._frames.every(function(bitmap) { return bitmap.isReady(); }); }
        $.prototype.isError = function() { return this._frames.some(function(bitmap) { return bitmap.isError(); }); }
        $.prototype.addLoadListener = function(listner) {};
        $.prototype.rotateHue = function(hue) {};
        
        /**
         * Calculate the current frame of the animation, given a specific timer. This way, each Sprite can calculate it's
         * own animation and run independent from each other.
         */
        $.prototype._currentAnimationFrame = function(timer) {
            return Math.floor((timer % (this._numFrames * this._frameRate)) / this._frameRate);
        };
        
    })(IAVRA.GIF.Gif);
    
    //=============================================================================
    // class Sprite
    //=============================================================================
    
    (function($) {
       defineBitmapProperty($);
        
        /**
         * When updating, we fetch the current animation frame from the container and refresh, if it's different from our
         * current frame.
         */
        var _alias_update = $.prototype.update;
        $.prototype.update = function() {
            if(this._iavra_gif.gif && this._iavra_gif.gif.constructor === IAVRA.GIF.Gif) {
                var nextFrame = this._iavra_gif.gif._currentAnimationFrame(++this._iavra_gif.timer);
                if(nextFrame !== this._iavra_gif.currentFrame) {
                    this._iavra_gif.currentFrame = nextFrame;
                    this._refresh();
                }
            }
            _alias_update.call(this);
        };
        
    })(Sprite);
    
    //=============================================================================
    // class TilingSprite
    //=============================================================================
    
    (function($) {
        defineBitmapProperty($);
        
        /**
         * When updating, we fetch the current animation frame from the container and refresh, if it's different from our
         * current frame. Since TilingSprite doesn't actually work with the Bitmap object itself, but with its baseTexture,
         * we have to call _onBitmapLoad() instead of _refresh(). This will cause the Sprite to reload the texture (this
         * time from the next frame in the animation).
         */
        var _alias_update = $.prototype.update;
        $.prototype.update = function() {
            if(this._iavra_gif.gif && this._iavra_gif.gif.constructor === IAVRA.GIF.Gif) {
                var nextFrame = this._iavra_gif.gif._currentAnimationFrame(++this._iavra_gif.timer);
                if(nextFrame !== this._iavra_gif.currentFrame) {
                    this._iavra_gif.currentFrame = nextFrame;
                    this._onBitmapLoad();
                }
            }
            _alias_update.call(this);
        };
        
    })(TilingSprite);
    
    //=============================================================================
    // class Bitmap
    //=============================================================================
    
    (function($) {
        
        /**
         * When loading a new Bitmap, we determine if it's animated (by matching the file name) and load our container
         * class, instead.
         */
        var _alias_load = $.load;
        $.load = function(url) {
            var match = _params.fileFormat.exec(url);
            return match ? IAVRA.GIF.Gif.load(url, match) : _alias_load.call(this, url);
        };
        
    })(Bitmap);

})();
