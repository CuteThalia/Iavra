/*:
 * @plugindesc Adds self variables to the game, that work similar to self switches.
 * <Iavra Self Variables>
 * @author Iavra
 *
 * @param Container Name
 * @desc Name of the self variables container. Default: $gameSelfVariables
 * @default $gameSelfVariables
 *
 * @param Plugin Command
 * @desc Name of the plugin command to manage self variables. Can't control whitespaces. Default: SelfVariable
 * @default SelfVariable
 *
 * @help
 * Adds self variables to the game. These work similar to self switches and are uniquely identifies by a map id, an event id and
 * a key (any string without whitespaces). This documentation assumes, that the plugin parameters "Container Name" and "Plugin
 * Command" are set to their default values.
 *
 * Basic access to self variables is done via script commands:
 * 
 * $gameSelfVariables.setValue([mapId, eventId, key], value);
 * $gameSelfVariables.value([mapId, eventId, key]);
 *
 * To access a self variable of the current event, the following script command can be used:
 *
 * $gameSelfVariables.get(this, key);
 *
 * Self Variables can also be modified via plugin commands. The following operations are available:
 *
 * =   Sets a self variable to a given value.
 * +   Adds a given value to a self variable.
 * -   Subtracts a given value from a self variable.
 * /   Divides a self variable with a given value.
 * *   Multiplies a self variable with a given value.
 * %   Sets a self variable to the remainder when dividing it with a given value (mod).
 *
 * To apply one of these operations, one of the following commands can be used:
 *
 * SelfVariable key operation value             // Invokes an operation with a given value.
 * SelfVariable key operation v[value]          // Invokes an operation with the value contained in a given variable.
 * SelfVariable key operation self[value]       // Invokes an operation with the value contained in a given self variable.
 * SelfVariable key operation (value1 ~ value2) // Invokes an operation with a random integer between 2 values.
 * SelfVariable key operation "value"           // Evaluates the given expression as an integer and invokes the operation with it.
 *
 * Further plugin commands are:
 *
 * SelfVariable key abs                         // Sets a self variable to its absolute value.
 */

var Imported = Imported || {};
Imported.iavra_self_variables = true;

//=============================================================================
// namespace IAVRA
//=============================================================================

(function() {
    "use strict";
    
    /**
     * Plugin parameters are loaded without using the PluginManager, since it relies on the actual filename.
     */
    var _params = $plugins.filter(function(p) { return p.description.contains('<Iavra Self Variables>'); })[0].parameters;
    var _containerName = _params['Container Name'];
    var _pluginCommand = _params['Plugin Command'];
    
    /**
     * Validate plugin parameters.
     */
    if(!_containerName) { throw new Error('container name can\'t be empty'); }
    if(!_pluginCommand || /\s/.test(_pluginCommand)) { throw new Error('plugin command can\'t be empty or contain whitespaces'); }
    
    /**
     * Basic operations, that can be used.
     */
    var _operations = {
        '=': function(cur, val) { return val; }, 
        '+': function(cur, val) { return cur + val; },
        '-': function(cur, val) { return cur - val; },
        '/': function(cur, val) { return cur / val; },
        '*': function(cur, val) { return cur * val; },
        '%': function(cur, val) { return cur % val; }
    };
    
    /**
     * A list of all operations.
     */
    var _opKeys = Object.keys(_operations).join();
    
    /**
     * Regexes matching all plugin commands, that can be used.
     */
    var _regex = {
        // SelfVariable <key> <operation> <value>
        modifyDirect: new RegExp('^([' + _opKeys + ']) ([+-]?\\d+)$'),
        // SelfVariable <key> <operation> v[<variableId>]
        modifyVariable: new RegExp('^([' + _opKeys + ']) [vV]\\[(\\d+)\\]$'),
        // SelfVariable <key> <operation> self[<selfVariableId>]
        modifySelfVariable: new RegExp('^([' + _opKeys + ']) self\\[(.+)\\]$', 'i'),
        // SelfVariable <key> <operation> (<min> ~ <max>)
        modifyRandom: new RegExp('^([' + _opKeys + ']) \\(([+-]?\\d+) ~ ([+-]?\\d+)\\)$'),
        // SelfVariable <key> <operation> "<script>"
        modifyScript: new RegExp('^([' + _opKeys + ']) "(.*)"$'),
        // SelfVariable <key> abs
        abs: /^abs$/i
    };
    
    /**
     * Tests all regexes given above. If one of them matches, the self variable is set to its new value and the function returns.
     */
    var _handleCommand = function(key, cmd) {
        var t = _testWithCallback, o = _operations, g = window[_containerName], c = g.value(key);
        // Modify self variable directly with the given value.
        if(t(cmd, _regex.modifyDirect, function(m) { g.setValue(key, o[m[1]](c, m[2])); })) { return; }
        // Modify self variable with the value of a given game variable.
        if(t(cmd, _regex.modifyVariable, function(m) { g.setValue(key, o[m[1]](c, $gameVariables.value(m[2]))); })) { return; }
        // Modify self variable with the value of a given self variable.
        if(t(cmd, _regex.modifySelfVariable, function(m) { g.setValue(key, o[m[1]](c, g.value([key[0], key[1], m[2]]))); })) { return; }
        // Modify self variable with a random number between 2 given values.
        if(t(cmd, _regex.modifyRandom, function(m) { g.setValue(key, o[m[1]](c, _randomInt(m[2], m[3]))); })) { return; }
        // Modify self variable with the result of a given script.
        if(t(cmd, _regex.modifyScript, function(m) { g.setValue(key, o[m[1]](c, parseInt(eval(m[2])))); })) { return; }
        // Sets self variable to its absolute value (3 -> 3, -3 -> 3).
        if(t(cmd, _regex.abs, function(m) { g.setValue(key, Math.abs(c)); })) { return; }
    };
    
    /**
     * If the given string matches the given regex, apply the given callback to it (supplying the match as a parameter). Returns
     * true on a match and false if not.
     */
    var _testWithCallback = function(string, regex, callback) {
        var match = regex.exec(string);
        if(!match) { return false; }
        callback(match);
        return true;
    };
    
    /**
     * Returns a random integer between 2 given values (both inclusive).
     */
    function _randomInt(min, max) {
        min = parseInt(min), max = parseInt(max);
        return Math.floor(Math.random() * (max - min + 1)) + min; 
    }
    
    //=============================================================================
    // class Game_SelfVariables
    //=============================================================================
    
    /**
     * This class is basically a copy of Game_SelfSwitches, mixed with Game_Variables.
     */
    var Game_SelfVariables = function() { this.initialize.apply(this, arguments); };
    
    (function($) {
        
        $.prototype.initialize = function() { this.clear(); };
        
        $.prototype.clear = function() { this._data = {}; };
        
        $.prototype.value = function(key) { return this._data[key] || 0; };
        
        $.prototype.setValue = function(key, value) {
            value = Math.floor(parseFloat(value));
            this._data[key] = value;
            this.onChange();
        };
        
        $.prototype.onChange = function() { $gameMap.requestRefresh(); };
        
        /**
         * Returns a self variable of the current event, when called from a Game_Interpreter as "$gameSelfVariables.get(this, 'A')".
         */
        $.prototype.get = function(interpreter, key) {
            return this.value([interpreter._mapId, interpreter._eventId, key]);
        };
        
    })(Game_SelfVariables);
    
    //=============================================================================
    // class Game_Interpreter
    //=============================================================================
    
    (function($) {
        
        /**
         * When our plugin command matches, extract the first argument as key and join the rest together, so it can be matched. Only
         * call the original function, if our command doesn't match (performance reasons).
         */
        $.prototype._iavra_selfVariables_pluginCommand = $.prototype.pluginCommand;
        $.prototype.pluginCommand = function(command, args) {
            if(command === _pluginCommand) {
                var key = [this._mapId, this._eventId, args.shift()];
                _handleCommand(key, args.join(' '));
                return;
            }
            this._iavra_selfVariables_pluginCommand(command, args);
        };
        
    })(Game_Interpreter);
    
    //=============================================================================
    // module DataManager
    //=============================================================================
    
    /**
     * Create, save and load our container object together with all other game objects.
     */
    (function($) {
        
        $._iavra_selfVariables_createGameObjects = $.createGameObjects;
        $.createGameObjects = function() {
            this._iavra_selfVariables_createGameObjects();
            window[_containerName] = new Game_SelfVariables();
        };
        
        $._iavra_selfVariables_makeSaveContents = $.makeSaveContents;
        $.makeSaveContents = function() {
            var contents = this._iavra_selfVariables_makeSaveContents();
            contents._iavra_selfVariables = window[_containerName];
        };
        
        $._iavra_selfVariables_extractSaveContents = $.extractSaveContents;
        $.extractSaveContents = function(contents) {
            this._iavra_selfVariables_extractSaveContents(contents);
            window[_containerName] = contents._iavra_selfVariables;
        };
        
    })(DataManager);
    
})();
