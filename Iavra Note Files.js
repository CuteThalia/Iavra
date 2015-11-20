/*:
 * @plugindesc Allows to store notetags in text files and reference them from database objects and events.
 * <Iavra Note Files>
 * @author Iavra
 *
 * @param File Path
 * @desc Path of the file to load. Multiple files can be specified when separated by commas. Default: data/notes.json
 * @default data/notes.json
 *
 * @param Notetag
 * @desc Tag used to load metadata from files. Default: textnote
 * @default textnote
 *
 * @help
 * Note: This plugin has to be placed below everything else that deals with DataManager.extractMetadata().
 *
 * Create one or more files and store their locations inside the "File Path" parameter, separated by comma. The
 * files are formatted like this:
 * 
 * {
 *     "key1" : "some notes",
 *     "key2" : "some more notes", 
 *     "key3" : [
 *         "notes with", 
 *         "linebreaks"
 *     ]
 * }
 * 
 * JSON itself doesn't allow real linebreaks inside Strings, but you can use an array, instead, which will automatically
 * be converted to a single String with linebreaks.
 *
 * Inside your database objects and events, you can reference these entries like this:
 *
 * <textnote key1>
 *
 * If "textnote" is already in use by another plugin or you want to use a different notetag, you can change it
 * with the "Notetag" plugin parameter".
 */

var Imported = Imported || {};
Imported.iavra_note_files = true;

//=============================================================================
// namespace IAVRA
//=============================================================================

var IAVRA = IAVRA || {};

(function() {
    "use strict";
    
    /**
     * Load plugin parameters. We don't use the PluginManager to be independent from our file name.
     */
    var _params = $plugins.filter(function(p) { return p.description.contains('<Iavra Note Files>'); })[0].parameters;
    
    /**
     * All files to be loaded. We use an object for two reasons. 1) It automatically eliminates duplicate entries. 2) We
     * need a way to keep track of all files that have already been loaded.
     */
    var _files = _params['File Path'].split(/\s*,\s*/).reduce(function(map, file) {
        !file || (map[file] = false); return map;
    }, {});
    
    /**
     * The notetag, that should be replaced with the loaded data.
     */
    var _regex = new RegExp('<[ ]*' + _params['Notetag'] + '[ ]+(.+?)[ ]*>', 'g');
    
    /**
     * Holds the content of all loaded files.
     */
    var _data = {};
    
    /**
     * Holds all callbacks to be executed, once the plugin has finished loading files.
     */
    var _listeners = [];
    
    /**
     * If any file isn't loaded yet, this returns false. Otherwise it returns true. We do this by testing if any file has
     * not yet finished loading and returning the inverse of it, since Array.some could be faster than Array.every for a
     * lot of files, since it only has to run until it encounters the first unloaded file and not all of them.
     */
    var isReady = function() {
        return !Object.keys(_files).some(function(key) { return !_files[key]; });
    };
    
    /**
     * Async loads a file, while keeping trace of all files not yet loaded and merges the contained JSON objects in
     * a single data variable to allow for easy access. When a file gets loaded, we test if we are done loading and execute
     * all listeners that have been registered in the meantime.
     */
    var loadFile = function(file) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', file);
        xhr.overrideMimeType('application/json');
        xhr.onload = function() {
            _files[file] = true;
            var result = JSON.parse(xhr.responseText);
            for(var key in result) {
                _data[key] = Array.isArray(result[key]) ? result[key].join('\n') : result[key];
            };
            if(isReady()) { 
                while (_listeners.length > 0) {
                    var listener = _listeners.shift();
                    listener();
                }
            };
        };
        xhr.onerror = function() { throw new Error("There was an error loading the file '" + file + "'."); };
        xhr.send();
    };
    
    /**
     * Since our note files start loading at the same time game data is loaded, we need to somehow make it stop 
     * processing, until we are done. We do this be adding a loadListener, which is executed after we are done. This
     * also means, that this plugin has to be placed below everything else that aliases DataManager.extractMetadata.
     */
    var addLoadListener = function(callback) {
        isReady() ? callback() : _listeners.push(callback);
    };
    
    /**
     * Recursively replaces all occurrences of our own notetag with the loaded data. Make sure to not have cyclic
     * references or this will cause your game to crash.
     */
    var replace = function(note) {
        if(_regex.test(note)) {
            return replace(note.replace(_regex, function(match, key) { return _data[key] || ''; }));
        }
        return note;
    };
    
    //=============================================================================
    // module DataManager
    //=============================================================================
    
    (function($) {
        
        /**
         * We start loading our text files, when everything else is being loaded.
         */
        var _alias_loadDatabase = $.loadDatabase;
        $.loadDatabase = function() {
            for(var file in _files) { loadFile(file); };
            _alias_loadDatabase.call(this);
        };
        
        /**
         * This function would originally been called the moment a data entry is loaded. However, since we have to wait until
         * our own files are loaded, we register a callback, instead. This also means, that this plugin has to be listed after
         * everything else that deals with DataManager.extractMetadata.
         */
        var _alias_extractMetadata = $.extractMetadata;
        $.extractMetadata = function(data) {
            addLoadListener(callback.bind(this, data));
        };
        
        /**
         * Callback to be executed, once all notetags have been loaded.
         */
        var callback = function(data) {
            data.note = replace(data.note);
            _alias_extractMetadata.call(this, data);
        };
        
    })(DataManager);
    
})();
