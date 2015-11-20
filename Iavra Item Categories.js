/*:
 * @plugindesc Allows to freely change the item categories in the game's main menu.
 * <Iavra Item Categories>
 * @author Iavra
 *
 * @param Configuration File
 * @desc Path to the configuration file, which contains all categories, their contents and labels.
 * @default itemCategories.json
 *
 * @param Notetag
 * @desc Tag that can be used inside of items to put them in a certain category.
 * @default category
 */

var Imported = Imported || {};
Imported.iavra_item_categories = true;

//=============================================================================
// namespace IAVRA
//=============================================================================

var IAVRA = IAVRA || {};

(function() {
    "use strict";

    var _params = (function($) {
        return {
            configFile: $['Configuration File'],
            regex: new RegExp('<[ ]*' + $['Notetag'] + '[ ]+(.*?)[ ]*>', 'g')
        };
    })($plugins.filter(function(p) { return p.description.contains('<Iavra Item Categories>'); })[0].parameters);
        
    var _config;
    
    var loadConfigFile = function() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', _params.configFile);
        xhr.overrideMimeType('application/json');
        xhr.onload = function() { _config = JSON.parse(xhr.responseText); };
        xhr.onerror = function() { throw new Error("There was an error loading the configuration file."); };
        xhr.send();
    };
    
    var isItemInCategory = function(categoryList, item) {
        var match;
        if(!item) { return false; }
        for(var index = 0, max = categoryList.length; index < max; ++index) {
            switch(categoryList[index]) {
                case ':item': if(DataManager.isItem(item) && item.itypeId === 1) { return true; } break;
                case ':weapon': if(DataManager.isWeapon(item)) { return true; } break;
                case ':armor': if(DataManager.isArmor(item)) { return true; } break;
                case ':keyItem': if(DataManager.isItem(item) && item.itypeId === 2) { return true; } break;
            };
        };
        while((match = _params.regex.exec(item.note))) { if(categoryList.contains(match[1])) { return true; } }
        return false;
    };
    
    //=============================================================================
    // class Window_ItemCategory
    //=============================================================================
    
    (function($) {
        
        $.prototype.makeCommandList = function() {
            _config.forEach(function(category) { this.addCommand(category.label, category.items); }, this);
        };
        
    })(Window_ItemCategory);
    
    //=============================================================================
    // class Window_ItemList
    //=============================================================================
    
    (function($) {
        
        $.prototype.includes = function(item) {
            return isItemInCategory(this._category, item);
        };
        
    })(Window_ItemList);
    
    //=============================================================================
    // class Scene_Boot
    //=============================================================================
    
    (function($) {
        
        var _alias_create = $.prototype.create;
        $.prototype.create = function() {
            _alias_create.call(this);
            loadConfigFile();
        };
        
        var _alias_isReady = $.prototype.isReady;
        $.prototype.isReady = function() {
            return _alias_isReady.call(this) && !!_config;
        };
        
    })(Scene_Boot);
    
})();
