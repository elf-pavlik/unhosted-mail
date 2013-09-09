RemoteStorage.defineModule('email', function(privateClient, publicClient) {

  /**
   * File: email
   *
   *
   */

  /**
   * Using the mailbox index:
   *
   *
   *
   *   email.mailbox('inbox').store({
   *     date: ...
   *     subject: ...
   *     body: ...
   *     to: [
   *       {
   *         name: ...
   *         address: ...
   *       }
   *     ]
   *   });
   *   // will store at:
   *   //   /email/mailbox/inbox/pool/<year>/<month>/<day>/
   *   //     <hour>-<minute>-<second>-<message-id>
   *   
   *   email.mailbox('inbox').list({
   *     limit: 50,
   *     order: 'desc'
   *   });
   *   // returns the 50 latest messages (this is also the defaults)
   *
   *   email.mailbox('sent').list({
   *     limit: 5,
   *     order: 'asc'
   *   });
   *   // returns the 5 oldest messages from 'sent' folder
   * 
   */

  /**
   * Class: email.recipient
   *
   * Property: name
   *
   * Property: address
   */

  /**
   * Class: email.draft
   */
  privateClient.declareType('draft', {
    type: 'object',
    properties: {

      from: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          },
          address: {
            type: 'string'
          }
        }
      },

      /**
       * Property: to
       * Array of recipients (<email.recipient> objects).
       */
      to: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: "string",
              required: true
            },
            address: {
              type: "string",
              required: true
            }
          }
        }
      },

      /**
       * Property: cc
       * Array of carbon copy recipients (<email.recipient> objects).
       */
      cc: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: "string",
              required: true
            },
            address: {
              type: "string",
              required: true
            }
          }
        }
      },

      /**
       * Property: bcc
       * Array of blind carbon copy recipients (<email.recipient> objects).
       */
      bcc: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: "string",
              required: true
            },
            address: {
              type: "string",
              required: true
            }
          }
        }
      },

      /**
       * Property: subject
       * Message subject.
       */
      subject: {
        type: 'string'
      },

      /**
       * Property: body
       * Message body.
       */
      body: {
        type: 'string'
      },

      /**
       * Property: date
       * Message date.
       * For a draft this represents the last time the draft was saved.
       */
      date: {
        type: 'date'
      },

      encrypt: {
        type: 'boolean',
        'default': false
      },

      sign: {
        type: 'boolean',
        'default': false
      }
    }
  });

  /**
   * Class: email.message
   *
   * Represents a received or sent message.
   *
   * Inherits from <email.draft>.
   *
   * Requires the following properties to be set:
   *  - <email.draft.to>,
   *  - <email.draft.subject>,
   *  - <email.draft.body> and
   *  - <email.draft.date> 
   */
  privateClient.declareType('message', {
    extends: 'draft',
    required: ['to', 'subject', 'body', 'date']
  });

  /**
   * Class: email.account
   *
   * Represents an account's basic metadata.
   *
   */
  privateClient.declareType('account', {
    type: 'object',
    properties: {
      /**
       * Property: name
       * The account owner's name.
       * This name is used as the sender name for outgoing messages.
       */
      name: { type: 'string' },
      /**
       * Property: address
       * The address associated with this account.
       * Will be used as the sender address for outgoing messages.
       */
      address: { type: 'string' }
    }
  });

  /**
   * Class: email.smtp-credentials
   */
  privateClient.declareType('smtp-credentials', {
    type: 'object',
    properties: {
      /**
       * Property: host
       */
      host: { type: 'string' },
      /**
       * Property: username
       */
      username: { type: 'string' },
      /**
       * Property: password
       */
      password: { type: 'string' },
      /**
       * Property: port
       */
      port: { type: 'number' },
      /**
       * Property: secure
       */
      secure: { type: 'boolean' },
    }
  });

  /**
   * Class: email.imap-credentials
   */
  privateClient.declareType('imap-credentials', {
    type: 'object',
    properties: {
      host: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
      port: { type: 'number' },
      secure: { type: 'boolean' },
    }    
  });

  function addressToKey(address) {
    return address.replace(/@/g, '-at-') + '/';
  }

  function keyToAddress(key) {
    if(key == 'current') return;
    try {
      return key.match(/^(.+?)\-at\-(.+)\/$/).slice(1).join('@');
    } catch(e) {
      console.error("WARNING: failed to convert key ot address: " + key);
    }
  }

  function compareAsc(a, b) { return a > b ? -1 : b > a ? 1 : 0; } 
  function compareDesc(a, b) { return a < b ? -1 : b < a ? 1 : 0; }

  var dateIndexMethods = {
    byDate: function(direction, limit) {
      console.log('byDate', arguments);
      var result = [];
      var sort = function(a) {
        return a ? a.sort('asc' ? compareAsc : compareDesc) : [];
      };

      if(! limit) throw "Limit not given";

      // FIXME: all this can be greatly simplified by abstraction.

      var fetchYear = function(years) {
        var year = years.shift();
        return this.getListing(year).
          then(sort).
          then(function(months) {
            return fetchMonth(year, months);
          }).
          then(function() {
            if(result.length < limit && years.length > 0) return fetchYear(years);
          });
      }.bind(this);

      var fetchMonth = function(year, months) {
        var month = months.shift();
        return this.getListing(year + month).
          then(sort).
          then(function(days) {
            return fetchDay(year, month, days);
          }).
          then(function() {
            if(result.length < limit && months.length > 0) return fetchMonth(year, months);
          });
      }.bind(this);

      var fetchDay = function(year, month, days) {
        var day = days.shift();
        return this.getListing(year + month + day).
          then(sort).
          then(function(messageIds) {
            return fetchMessage(year, month, day, messageIds);
          }).
          then(function() {
            if(result.length < limit && days.length > 0) return fetchDay(year, month, days);
          });
      }.bind(this);

      var fetchMessage = function(year, month, day, messageIds) {
        var messageId = messageIds.shift();
        var path = year + month + day + messageId;
        return this.getObject(path).then(function(message) {
          if(message) {
            message.path = path;
            result.push(message);
          }
        }).then(function() {
          if(result.length < limit && messageIds.length > 0) return fetchMessage(year, month, day, messageIds);
        });
      }.bind(this);

      return this.getListing().then(sort).then(fetchYear).
        then(function() {
          return result;
        });
    },

    storeByDate: function(type, date, id, object) {
      console.log('storeByDate', type, date, id, object);
      this._attachType(object, type);
      console.log('attached type', object);
      var result = this.validate(object);
      if(result.error) {
        console.log('validation result', result);
        throw result.error;
      }
      if(typeof(date) == 'string') {
        date = new Date(Date.parse(date));
      }
      var basePath = [
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate()
      ].join('/');
      var fileName = [
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
      ].join('-') + '-' + id;
      return this.storeObject(type, basePath + '/' + encodeURIComponent(fileName), object);
    }
  };

  var mailboxCache = {};

  /**
   * Method: openMailbox
   *
   * returns a <MailboxScope>.
   */
  var openMailbox = function(name) {
    if(mailboxCache[name]) return mailboxCache[name];
    var mailbox = privateClient.scope('mailbox/' + encodeURIComponent(name) + '/');
    mailbox.name = name;
    mailbox.extend(mailboxMethods);
    mailbox.pool = mailbox.scope('pool/').extend(dateIndexMethods);
    mailboxCache[name] = mailbox;
    return mailbox;
  }

  /**
   * Class: MailboxScope
   *
   *   Represents a mailbox.
   *
   *
   * Property: name
   *   Name of the mailbox
   *
   *
   * Property: pool
   *   Direct access to the message pool (a <DateIndexedScope>)
   */

  var mailboxMethods = {

    /**
     * Method: store
     *
     * Takes a <email.message> object and stores it.
     */
    store: function(message) {
      return this.pool.storeByDate('message', message.date, message.messageId, message).
        then(function() {
          this.updateCounts( + 1 );
        }.bind(this));
    },

    storeAll: function(messages) {
      var n = messages.length, i = 0;
      var promise = promising();
      var errors = [];
      var oneDone = function() {
        console.log('saved ' + i + '/' + n + ' messages.');
        i++;
        if(i === n) {
          this.updateCounts( + n ).then(function() {
            promise.fulfill(errors.length > 0 ? errors : null);
          });
        }
      }.bind(this);
      var oneFailed = function(error) {
        console.log('failed', error);
        errors.push(error);
        oneDone();
      }.bind(this);
      messages.forEach(function(message) {
        this.pool.storeByDate('message', message.date, message.messageId, message).then(
          oneDone, oneFailed
        );
      }.bind(this));
      if(n == 0) promise.fulfill();
      return promise;
    },

    updateCounts: function(step) {
      return this.getFile('count').then(function(count) {
        return this.storeFile('text/plain', 'count', String((parseInt(count) || 0) + step));
      }.bind(this));
    },

    /**
     * 
     */
    list: function(options) {
      if(! options) options = {};
      return this.pool.byDate(
        options.order || 'desc',
        options.limit || 50
      );
    },

    unread: function() {
      return this.getObject('unread-index');
    }
  };

  return {
    exports: {

      /**
       * Object: email.credentials
       */
      credentials: privateClient.scope('credentials/').extend({
        getCurrent: function() {
          return this.getObject('current').then(function(account) {
            return (account && account.address) ?
              this.getAccount(account.address) : undefined;
          }.bind(this));
        },

        setCurrent: function(account) {
          return this.storeObject('account', 'current', account);
        },

        removeCurrent: function() {
          return this.remove('current');
        },

        listAccounts: function() {
          return this.getListing('').then(function(keys) {
            return keys ? keys.map(keyToAddress).filter(function(address) {
              return !! address;
            }) : [];
          });
        },

        getAccount: function(address) {
          var accountScope = this.scope(addressToKey(address));
          return accountScope.getListing('').then(function(keys) {
            // don't return empty accounts, but instead 'undefined'.
            if((!keys) || Object.keys(keys).length === 0) {
              return undefined;
            } else {
              var promise = promising();
              var items = {};
              var n = keys.length, i = 0;
              function oneDone(key, value) {
                items[key] = value;
                i++;
                if(i == n) promise.fulfill(items);
              }
              keys.forEach(function(key) {
                accountScope.getObject(key).then(function(value) {
                  oneDone(key, value);
                }, function(error) {
                  console.error("failed to get account part '" + key + "': ", error, error.stack);
                  oneDone(key, undefined);
                });
              });
              return promise;
            }
          });
        },

        saveAccount: function(account) {
          var promise = promising();
          if(! account.actor.address) {
            promise.reject(["Can't save account without actor.address!"]);
            return promise;
          }
          var files = [];
          [['account', 'actor'],
           ['smtp-credentials', 'smtp'],
           ['imap-credentials', 'imap']
          ].forEach(function(fileDef) {
            var obj = account[fileDef[1]];
            if(obj) {
              if(obj.port) { obj.port = parseInt(obj.port); }
              files.push(fileDef.concat([obj]));
            }
          });
          var accountScope = this.scope(addressToKey(account.actor.address));
          var errors = [];
          var n = files.length, i = 0;
          function oneDone() {
            i++;
            if(i == n) {
              promise.fulfill(errors.length > 0 ? errors : null, account);
            }
          }
          function oneFailed(error) {
            errors.push(error);
            oneDone();
          }
          for(var j=0;j<n;j++) {
            accountScope.storeObject.apply(accountScope, files[j]).
              then(oneDone, oneFailed);
          }
          return promise;
        },

        removeAccount: function(address) {
          var accountScope = this.scope(addressToKey(address));
          return accountScope.getListing('').then(function(items) {
            var promise = promising();
            var n = items.length, i = 0;
            var errors = [];
            function oneDone() {
              i++;
              if(i == n) promise.fulfill(errors);
            }
            function oneFailed(error) {
              errors.push(error);
              oneDone();
            }
            items.forEach(function(item) {
              accountScope.remove(item).then(oneDone, oneFailed);
            });
          });
        }
      }),

      /**
       * Object: email.drafts
       */
      drafts: privateClient.scope('drafts/').extend({
        /**
         * Method: getLatest
         *
         * Get latest draft.
         */
        getLatest: function() {
          return this.getObject('latest');
        },

        /**
         * Method: saveLatest
         *
         * Save given draft as latest one.
         *
         * Parameters:
         *   draft - A <email.draft> Object
         */
        saveLatest: function(draft) {
          return this.storeObject('draft', 'latest', draft);
        },

        removeLatest: function() {
          return this.remove('latest');
        }
      }),

      mailbox: openMailbox
    }
  };
});
