/*:
 * @plugindesc Allows to store all text content in an external file and switch between languages at runtime.
 * <Iavra Localization>
 * @author Iavra
 *
 * @param Supported Languages
 * @desc Comma-separated list of all supported game languages. The first entry will be treated as default.
 * @default
 *
 * @param File Path
 * @desc Where to load localization files from. "{lang}" will be replaced with the languages specified above.
 * @default i18n/{lang}.json
 *
 * @param Escape Code
 * @desc Code used to insert localized text in game messages. Is used with an additional key parameter.
 * @default :
 *
 * @param Add Menu Entry
 * @desc If set to true, adds a new entry in the options menu, that can be used to change the language.
 * @default false
 *
 * @help
 * To first export your current text entries and to create a template of a language file, set the parameter
 * "Supported Languages" to empty and execute this following script:
 * 
 * IAVRA.I18N.exportJson();
 *
 * This will open a new window containing the current data. Save this file under "i18n/{lang}.json", where {lang}
 * is the language this file stands for. You can copy it any number of times and save different versions to
 * support different languages. You also need to extend the category "options" to contain the labels for all the
 * languages you just added. So, if you are supporting german ("de") and english ("en"), your "options" entry in
 * "i18n/en.json" would look like this:
 * 
 * "options": {
 *     "option": "Game Language",
 *     "en": "English",
 *     "de": "Deutsch"
 * }
 * 
 * "option" is the text that will be shown in the options menu, if you set the parameter "Add Menu Entry" to true.
 * I advise not to translate the language labels, because it might be hard for non english speaking users to find
 * their own language.
 *
 * When you are finished editing the files, change the parameter "Supported Languages" to contain all of your
 * languages, separated by a comma. So in this case that would be "en, de". Note that the first language will be
 * treated as the default if no config file could be found.
 *
 * To change the current language, there are 3 options. The first 2 are actually the same and allow you to temporarily
 * change the current language. To do this, execute one of these script calls:
 *
 * IAVRA.I18N.changeLanguage("de");
 * ConfigManager.language = "de";
 *
 * However, this change will only last for as long as the game is running and will revert to the default, afterwards.
 * If you want to persistently change the language set the parameter "Add Menu Entry" to true and have the user go
 * to the options menu. There will be a new entry for changing the current language, which will be saved in the option
 * file.
 *
 * If you want to localize text messages, you can save them under the "text" category of the language file, which has
 * been created for you when you exported the current text data. So, if you want to create a welcome message for the
 * user, you can do it like this:
 *
 * "text: {
 *     "welcome": "Hello, User"   
 * }
 *
 * If you want to use this in a message, you need the escape code you can define by setting "Escape Code". Assuming
 * you left it at the default value ":", your message would contain this tag:
 *
 * \:[welcome]
 *
 * You are free to use any escape codes inside language files, but note that you might need to double backslashes. So
 * if you want to display the variable #1, you'd write "\\V[1]" instead of "\V[1]". Also, it's possible to recursively
 * use our own escape code, so if you would change your "text" category to this:
 *
 * "text: {
 *     "welcome": "Hello, \\:[user]",
 *     "user": "User"
 * }
 *
 * Your "\:[welcome"] would still be resolved to "Hello, User". This is handy if you have certain text entries, that
 * might be subject to change, but are used at multiple places (like town names) and allows you to keep them in a central
 * spot.
 */

var Imported = Imported || {};
Imported.iavra_localization = true;

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
            languages: $['Supported Languages'].split(/\s*,\s*/).filter(function(value) { return !!value; }),
            filePath: $['File Path'],
            textRegex: new RegExp('\\\\' + $['Escape Code'] + '\\[(.+)\\]', 'g'),
            menuEntry: $['Add Menu Entry'].toLowerCase() === 'true'
        };
    })($plugins.filter(function(p) { return p.description.contains('<Iavra Localization>'); })[0].parameters);
    
    /**
     * Mappings for indizes to keys or for which attributes to export/import. Please don't change this, unless
     * you really know what you're doing.
     */
    var _mappings = {
        /**
         * $dataSystem.terms.basic, the order is important!
         */
        basic: ['level', 'levelA', 'hp', 'hpA', 'mp', 'mpA', 'tp', 'tpA', 'exp', 'expA'],
        /**
         * $dataSystem.terms.params, the order is important!
         */
        params: ['maxHP', 'maxMP', 'attack', 'defense', 'mAttack', 'mDefense', 'agility', 'luck', 'hitRate', 'evasion'],
        /**
         * $dataSystem.terms.commands, both order and null values are important!
         */
        commands: ['fight', 'escape', 'attack', 'guard', 'item', 'skill', 'equip', 'status', 'formation', 'save',
                  'gameEnd', 'options', 'weapon', 'armor', 'keyItem', 'equip2', 'optimize', 'clear', 'newGame',
                  'continue', null, 'toTitle', 'cancel', null, 'buy', 'sell'],
        /**
         * $dataSystem.terms.messages.
         */
        messages: ['alwaysDash', 'commandRemember', 'bgmVolume', 'bgsVolume', 'meVolume', 'seVolume', 'possession',
                  'expTotal', 'expNext', 'saveMessage', 'loadMessage', 'file', 'partyName', 'emerge', 'preemptive',
                  'surprise', 'escapeStart', 'escapeFailure', 'victory', 'defeat', 'obtainExp', 'obtainGold',
                  'obtainItem', 'levelUp', 'obtainSkill', 'useItem', 'criticalToEnemy', 'criticalToActor',
                  'actorDamage', 'actorRecovery', 'actorGain', 'actorLoss', 'actorDrain', 'actorNoDamage', 'actorNoHit',
                  'enemyDamage', 'enemyRecovery', 'enemyGain', 'enemyLoss', 'enemyDrain', 'enemyNoDamage', 'enemyNoHit',
                  'evasion', 'magicEvasion', 'magicReflection', 'counterAttack', 'substitute', 'buffAdd', 'debuffAdd',
                  'buffRemove', 'actionFailure'],
        /**
         * $dataActors
         */
        actors: ['name', 'nickname', 'profile'],
        /**
         * $dataClasses
         */
        classes: ['name'],
        /**
         * $dataSkills
         */
        skills: ['name', 'description', 'message1', 'message2'],
        /**
         * $dataItems
         */
        items: ['name', 'description'],
        /**
         * $dataWeapons
         */
        weapons: ['name', 'description'],
        /**
         * $dataArmors
         */
        armors: ['name', 'description'],
        /**
         * $dataEnemies
         */
        enemies: ['name'],
        /**
         * $dataStates
         */
        states: ['name', 'message1', 'message2', 'message3', 'message4'],
        /**
         * Placeholder for this plugin's entry to the options menu.
         */
        options: undefined, 
        /**
         * Placeholder for localized game messages.
         */
        text: undefined
    };
    
    /**
     * Some categories are handled in the same way and can be grouped together, so the filesize of this plugin
     * doesn't get bloated.
     */
    var _categoryGroups = {
        system: ['gameTitle', 'currencyUnit'], 
        terms: ['basic', 'params', 'commands'],
        types: ['elements', 'skillTypes', 'weaponTypes', 'armorTypes', 'equipTypes'],
        data: ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'states']
    };
    
    /**
     * Contains all localized text.
     */
    var _data = {};
    
    /**
     * The current language.
     */
    var _lang;
    
    /**
     * Loads all language files and put their contents in our data variable. We also sanitize missing entries,
     * sp the plugin doesn't just crash.
     */
    var loadDatabase = function() {
        _params.languages.forEach(function(lang) {
            loadFile(_params.filePath.replace('{lang}', lang), function(data) {
                Object.keys(_mappings).forEach(function(category) { data[category] || (data[category] = {}); });
                _data[lang] = data;
            });
        });
        // This serves as fallback, when no languages are specified and can be used for exporting.
        _data[undefined] = Object.keys(_mappings).reduce(function(map, category) { map[category] = {}; return map; }, {});
    };
    
    /**
     * Helper function to async load a file and execute a given callback after the request finishes.
     */
    var loadFile = function(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.overrideMimeType('application/json');
        xhr.onload = function() { callback(JSON.parse(xhr.responseText)); };
        xhr.onerror = function() { throw new Error("There was an error loading the file '" + url + "'."); };
        xhr.send();
    };
    
    /**
     * Used to determine if all async calls have been completed.
     */
    var isDatabaseLoaded = function() {
        return _params.languages.every(function(lang) { return _data[lang] !== undefined; });
    };
    
    /**
     * Actors save their name, nickname and profile and don't dynamically read them from $dataActors, like every other
     * data type does, so they need special treatment. Also this needs to be called when loading a savegame or otherwise
     * the user could change the language and load a game and these changes wouldn't carry over.
     */
    var fixGameActors = function() {
        $gameActors._data.forEach(function(actor, index) {
            if(!actor || !$dataActors[index]) { return; }
            actor._name = $dataActors[index].name;
            actor._nickname = $dataActors[index].nickname;
            actor._profile = $dataActors[index].profile;
        });
    };
    
    //=============================================================================
    // module IAVRA.I18N
    //=============================================================================
    
    IAVRA.I18N = {
        /**
         * Can be used to export all text entries in the game, except messages. Still a whole lot of stuff. Opens
         * a new window containing the created JSON data.
         */
        exportJson: function() {
            var data = {};
            _categoryGroups.system.forEach(function(key) { data[key] = $dataSystem[key]; });
            _categoryGroups.terms.forEach(function(category) {
                data[category] = _mappings[category].reduce(function(map, key, index) { !key || (map[key] = $dataSystem.terms[category][index]); return map; }, {});
            });
            data.messages = _mappings.messages.reduce(function(map, key) { !key || (map[key] = $dataSystem.terms.messages[key]); return map; }, {});
            _categoryGroups.types.forEach(function(category) {
                data[category] = $dataSystem[category].reduce(function(map, value, index) { !value || (map[index] = value); return map;  }, {});
            });
            _categoryGroups.data.forEach(function(category) {
                data[category] = window['$data' + category[0].toUpperCase() + category.slice(1)].reduce(function(map, value, index) {
                    !value || (map[index] = _mappings[category].reduce(function(map, key) { map[key] = value[key]; return map; }, {})); return map;
                }, {});
            });
            data.options = {option: TextManager._text('options', 'option') || 'Change game language'};
            _params.languages.forEach(function(lang) { data.options[lang] = TextManager._text('options', lang) || lang; });
            data.text = {};
            window.open(encodeURI('data:text/json;charset=utf-8,' + JSON.stringify(data, null, '\t')));
        },
        /**
         * Changes the current language. Note that direct calls to this function will only temporarily change the
         * language and it will revert to its former value after a reload. If you want to persistently change the
         * language, use the ConfigManager, instead.
         */
        changeLanguage: function(lang) {
            // If no language was given or the given language is not supported, we do nothing.
            if(!lang || !_data[lang]) { return; }
            _lang = lang;
            // Setting system data.
            _categoryGroups.system.forEach(function(key) { $dataSystem[key] = _data[_lang][key] || ''; });
            // Setting terms on $dataSystem.
            _categoryGroups.terms.forEach(function(category) {
                $dataSystem.terms[category].forEach(function(term, index) {
                    !term || ($dataSystem.terms[category][index] = (_data[_lang][category] || {})[_mappings[category][index]] || '');
                });
            });
            Object.keys($dataSystem.terms.messages).forEach(function(key) {
                $dataSystem.terms.messages[key] = _data[_lang].messages[key] || '';
            });
            // Setting types on $dataSystem.
            _categoryGroups.types.forEach(function(category) {
                $dataSystem[category].forEach(function(type, index) {
                    !type || ($dataSystem[category][index] = (_data[_lang][category] || {})[index] || '');
                });
            });
            // Setting a lot of stuff on $data<...> arrays.
            _categoryGroups.data.forEach(function(category) {
                window['$data' + category[0].toUpperCase() + category.slice(1)].forEach(function(element, index) {
                    !element || _mappings[category].forEach(function(key) {
                        element[key] = (_data[_lang][category][index] || {})[key] || '';
                    });
                });
            });
            // Fixing $gameActors, if they exist.
            !$gameActors || fixGameActors();
        },
        /**
         * Returns the current language.
         */
        currentLanguage: function() { return _lang; }
    };
    
    //=============================================================================
    // module TextManager
    //=============================================================================
    
    (function($) {
        
        /**
         * Can be used to retrieve text from any category, including custom ones.
         */
        $._text = function(category, key) {
            return (_data[_lang][category] || {})[key] || '';
        };
        
    })(TextManager);
    
    //=============================================================================
    // module ConfigManager
    //=============================================================================
    
    (function($) {
        
        /**
         * Returns the current language and can be used to set the current language. Note, that changes done in
         * the ConfigManager aren't persisted until ConfigManager.save() has been called, which is automatically
         * done when Scene_Options is terminated.
         */
        Object.defineProperty($, 'language', {
            get: function() { return _lang; },
            set: function(value) { IAVRA.I18N.changeLanguage(value || _params.languages[0]); },
            configurable: true
        });

        /**
         * Include the current language in the options savefile.
         */
        var _alias_makeData = $.makeData;      
        $.makeData = function() {
            var config = _alias_makeData.call(this);
            config.language = this.language;
            return config;
        };
        
        /**
         * Load the current language from the options savefile.
         */
        var _alias_applyData = $.applyData;
        $.applyData = function(config) {
            _alias_applyData.call(this, config);
            this.language = config.language;
        };
        
    })(ConfigManager);
    
    //=============================================================================
    // module DataManager
    //=============================================================================
    
    (function($) {
        
        /**
         * Fixing $gameActors, when they get created.
         */
        var _alias_createGameObjects = $.createGameObjects;
        $.createGameObjects = function() {
            _alias_createGameObjects.call(this);
            fixGameActors();
        };
        
        /**
         * Fixing $gameActors after a save has been loaded, in case the language was changed in the meantime.
         */
        var _alias_extractSaveContents = $.extractSaveContents;
        $.extractSaveContents = function(contents) {
            _alias_extractSaveContents.apply(this, arguments);
            fixGameActors();
        };
        
    })(DataManager);
    
    //=============================================================================
    // class Scene_Boot
    //=============================================================================

    (function($) {
        
        /**
         * Loading our database on game startup.
         */
        var _alias_create = $.prototype.create;
        $.prototype.create = function() {
            loadDatabase();
            _alias_create.call(this);
        };
        
        /**
         * We are waiting for out localization files to be loaded. This way, we are free to use async loading,
         * which is more flexible than sync loading and doesn't throw a warning in browsers. Sadly, we have to
         * call ConfigManager.load() a second time, after our database has been loaded, because it's called
         * too early for us. So this basically means, that we are loading the config file twice, but the only
         * alternative would be to rewrite Scene_Boot.create without extending it, which is kind of ugly, because
         * it means that this plugin would always have to be at the top of the plugin list.
         */
        var _alias_isReady = $.prototype.isReady;
        $.prototype.isReady = function() {
            var ready = isDatabaseLoaded() && _alias_isReady.call(this);
            if(ready) { ConfigManager.load(); }
            return ready;
        };
        
    })(Scene_Boot);
    
    //=============================================================================
    // class Window_Base
    //=============================================================================
    
    (function($) {
        
        /**
         * Replaces all occurences of the given escape character with the localized text or "", if the key could
         * not be found. This is done recursively, so it's possible to specify the escape character in localized
         * text and specify subjects to change in central places (like city names). Also, this is done before
         * other escape characters are replaced, so it's possible to use other escape characters in localized
         * text, too.
         */
        var replace = function(text) {
            if(_params.textRegex.test(text)) {
                return replace(text.replace(_params.textRegex, function(match, group) {
                    return _data[_lang].text[group] || "";
                }));
            }
            return text;
        };
        
        /**
         * Before converting escape characters, we first replace our own character with localized text, so it's
         * possible to use escape characters in there.
         */
        var _alias_convertEscapeCharacters = $.prototype.convertEscapeCharacters;
        $.prototype.convertEscapeCharacters = function(text) {
            return _alias_convertEscapeCharacters.call(this, replace(text));
        };
        
    })(Window_Base);
    
    //=============================================================================
    // class Window_Options
    //=============================================================================
    
    if(_params.menuEntry) {
        (function($) {
            
            /**
             * Returns the previous language in the list or either the same language (if the list has only one
             * element) or undefined (if the list is empty).
             */
            var getPrevLanguage = function(lang) {
                var prevIndex = _params.languages.indexOf(lang) - 1;
                return _params.languages[prevIndex < 0 ? _params.languages.length - 1 : prevIndex];
            };
            
            /**
             * Returns the next language in the list or either the same language (if the list has only one element)
             * or undefined (if the list is empty).
             */
            var getNextLanguage = function(lang) {
                var nextIndex = _params.languages.indexOf(lang) + 1;
                return _params.languages[nextIndex > _params.languages.length ? 0 : nextIndex];
            };
            
            /**
             * Add our own command at the top, since it makes kind of sense.
             */
            var _alias_makeCommandList = $.prototype.makeCommandList;
            $.prototype.makeCommandList = function() {
                this.addCommand(TextManager._text('options', 'option'), 'language');
                _alias_makeCommandList.call(this);
            };
            
            /**
             * The basic values are either ON/OFF or a percentage value, but we want something else.
             */
            var _alias_statusText = $.prototype.statusText;
            $.prototype.statusText = function(index) {
                var symbol = this.commandSymbol(index);
                if(symbol === 'language') {
                    return TextManager._text('options', this.getConfigValue(symbol));
                } else {
                    return _alias_statusText.call(this, index);
                }
            };
            
            /**
             * On Ok, switch to the next language.
             */
            var _alias_processOk = $.prototype.processOk;
            $.prototype.processOk = function() {
                var symbol = this.commandSymbol(this.index());
                if(symbol === 'language') {
                    this.changeValue(symbol, getNextLanguage(this.getConfigValue(symbol)))
                } else {
                    _alias_processOk.call(this);
                }
            };
            
            /**
             * On right, switch to the next language.
             */
            var _alias_cursorRight = $.prototype.cursorRight;
            Window_Options.prototype.cursorRight = function(wrap) {
                var symbol = this.commandSymbol(this.index());
                if(symbol === 'language') {
                    this.changeValue(symbol, getNextLanguage(this.getConfigValue(symbol)))
                } else {
                    _alias_cursorRight.call(this, wrap);
                }
            };
            
            /**
             * On left, switch to the next language.
             */
            var _alias_cursorLeft = $.prototype.cursorLeft;
            Window_Options.prototype.cursorLeft = function(wrap) {
                var symbol = this.commandSymbol(this.index());
                if(symbol === 'language') {
                    this.changeValue(symbol, getPrevLanguage(this.getConfigValue(symbol)))
                } else {
                    _alias_cursorLeft.call(this, wrap);
                }
            };
            
        })(Window_Options);
    }
    
})();
