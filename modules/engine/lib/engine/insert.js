/*
 * Copyright 2011 eBay Software Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var jsonfill = require('./jsonfill.js'),
    _ = require('underscore'),
    assert = require('assert');

exports.exec = function(opts, statement, parentEvent, cb) {

    assert.ok(opts.tables, 'Argument tables can not be undefined');
    assert.ok(statement, 'Argument statement can not be undefined');
    assert.ok(statement, 'Argument cb can not be undefined');

    var tables = opts.tables, context = opts.context,
        request = opts.request, emitter = opts.emitter,
        insertTx, table, values, name, resource;

    insertTx = opts.logEmitter.wrapEvent({
        parent: parentEvent,
        txType: 'QlIoInsert',
        txName: null,
        message: {line: statement.line},
        cb: cb});

    values = {};
    _.each(statement.values, function(value, i) {
        values[statement.columns[i].name] = jsonfill.lookup(value, context);
    });


    // Get the dest
    name = statement.source.name;

    // Lookup context for the source - we do this since the compiler puts the name in
    // braces to denote the source as a variable and not a table.
    if(name.indexOf("{") === 0 && name.indexOf("}") === name.length - 1) {
        name = name.substring(1, statement.source.name.length - 1);
    }

    resource = context[name];
    if(context.hasOwnProperty(name)) { // The value may be null/undefined, and hence the check the property
        resource = jsonfill.unwrap(resource);
        _.each(values, function(val, key) {
            resource[key] = val;
        });
        return insertTx.cb(undefined, resource);
    }
    else {
        // Get the resource
        table = opts.tempResources[name] || tables[name];
        if(!table) {
            return insertTx.cb('No such table ' + name);
        }
        var verb = table.verb('insert');
        if(!verb) {
            return insertTx.cb('Table ' + statement.source.name + ' does not support insert');
        }
        verb.exec({
            context: opts.context,
            config: opts.config,
            settings: opts.settings,
            resource: verb,
            xformers: opts.xformers,
            serializers: opts.serializers,
            params: values,
            request: request,
            statement: statement,
            emitter: emitter,
            logEmitter: opts.logEmitter,
            parentEvent: insertTx.event,
            callback: function(err, result) {
                if(result) {
                    context[statement.assign] = result.body;
                    opts.emitter.emit(statement.assign, result.body);
                }
                return insertTx.cb(err, result);
            }
        });
    }
};
