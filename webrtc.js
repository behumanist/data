        window.onerror = console.error = function() {
            var error = JSON.stringify(arguments);
            if(error.indexOf('Blocked a frame with origin') !== -1) {
                return;
            }
            alert('Error:\n' + error);
        };

        // Muaz Khan     - https://github.com/muaz-khan
        // MIT License   - https://www.WebRTC-Experiment.com/licence/
        // Source Code   - https://github.com/muaz-khan/RTCMultiConnection

        window.addEventListener('load', function() {
            if (window.localStorage.getItem('room-id')) {
                document.getElementById('room-id').value = window.localStorage.getItem('room-id');
            } else {
                document.getElementById('room-id').value = (Math.random() * 100).toString().replace('.', '');
            }

            if(location.hash.length > 1) {
               document.getElementById('room-id').value = location.hash.replace('#', '');
            }

            document.getElementById('join-room').onclick = document.querySelector('.btn-select-file').onclick = function() {
                document.getElementById('join-room').disabled = true;
                document.getElementById('room-id').disabled = true;

                var roomId = document.getElementById('room-id').value;
                window.localStorage.setItem('room-id', roomId);

                joinARoom(roomId);
            };

            if(location.hash.length > 1) {
                document.getElementById('join-room').disabled = true;
                document.getElementById('room-id').disabled = true;
                joinARoom(location.hash.replace('#', ''));
            }
        });

        var btnSelectFile = document.querySelector('.btn-select-file');
        var connection;

        function joinARoom(roomId) {
            var iframe = document.querySelector('iframe');

            btnSelectFile.onclick = function(file) {
                if(file || (file instanceof File || file instanceof Blob) || file.size) {
                  previewFile(file);
                  onFileSelected(file);
                  return;
                }

                var fileSelector = new FileSelector();
                fileSelector.selectSingleFile(function(file) {
                    previewFile(file);
                    onFileSelected(file);
                });
            };

            var lastSelectedFile;

            var room_id = '';

            // 60k -- assuming receiving client is chrome
            var chunk_size = 60 * 1000;

            function setupWebRTCConnection() {
                if (connection) {
                    return;
                }

                // www.RTCMultiConnection.org/docs/
                connection = new RTCMultiConnection();

                // to make sure, "connection-reconnect" doesn't sends files again
                connection.fileReceived = {};

                // by default, socket.io server is assumed to be deployed on your own URL
                connection.socketURL = '/';

                // comment-out below line if you do not have your own socket.io server
                // connection.socketURL = 'https://rtcmulticonnection.herokuapp.com:443/';

                connection.socketMessageEvent = 'file-sharing-demo';

                connection.chunkSize = chunk_size;

                connection.sdpConstraints.mandatory = {
                    OfferToReceiveAudio: false,
                    OfferToReceiveVideo: false
                };

                connection.enableFileSharing = true;

                if (room_id || room_id.length) {
                    connection.userid = room_id;
                }

                connection.channel = connection.sessionid = roomId;

                connection.session = {
                    data: true,
                    // oneway: true --- to make it one-to-many
                };

                // https://www.rtcmulticonnection.org/docs/iceServers/
                // use your own TURN-server here!
                connection.iceServers = [{
                    'urls': [
                        'stun:stun.l.google.com:19302',
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302',
                        'stun:stun.l.google.com:19302?transport=udp',
                    ]
                }];

                connection.filesContainer = logsDiv;

                connection.connectedWith = {};

                connection.onmessage = function(event) {
                    if(event.data.doYouWannaReceiveThisFile) {
                        if(!connection.fileReceived[event.data.fileName]) {
                            connection.send({
                                yesIWannaReceive:true,
                                fileName: event.data.fileName
                            });
                        }
                    }

                    if(event.data.yesIWannaReceive || !!lastSelectedFile) {
                        connection.shareFile(lastSelectedFile, event.userid);
                    }
                };

                connection.onopen = function(e) {
                    try {
                        chrome.power.requestKeepAwake('display');
                    }
                    catch(e) {}

                    if (connection.connectedWith[e.userid]) return;
                    connection.connectedWith[e.userid] = true;

                    var message = '<b>' + e.userid + '</b><br/>is connected.';
                    appendLog(message);

                    if (!lastSelectedFile) return;

                    // already shared the file

                    var file = lastSelectedFile;
                    setTimeout(function() {
                        appendLog('Sharing file<br/><b>' + file.name + '</b><br/>Size: <b>' + bytesToSize(file.size) + '<b><br/>With <b>' + connection.getAllParticipants().length + '</b> users');

                        connection.send({
                            doYouWannaReceiveThisFile: true,
                            fileName: file.size + file.name
                        });
                    }, 500);
                };

                connection.onclose = function(e) {
                    incrementOrDecrementUsers();

                    if (connection.connectedWith[e.userid]) return;

                    appendLog('Data connection has been closed between you and <b>' + e.userid + '</b>. Re-Connecting..');
                    connection.join(roomId);
                };

                connection.onerror = function(e) {
                    if (connection.connectedWith[e.userid]) return;

                    appendLog('Data connection failed. between you and <b>' + e.userid + '</b>. Retrying..');
                };

                setFileProgressBarHandlers(connection);

                connection.onUserStatusChanged = function(user) {
                    incrementOrDecrementUsers();
                };

                connection.onleave = function(user) {
                    user.status = 'offline';
                    connection.onUserStatusChanged(user);
                    incrementOrDecrementUsers();
                };

                var message = 'Connecting room:<br/><b>' + connection.channel + '</b>';
                appendLog(message);

                connection.openOrJoin(connection.channel, function(isRoomExist, roomid) {
                    var message = 'Successfully connected to room: <b>' + roomid + '</b><hr/>Other users can join you on iPhone/Android using "' + roomid + '" or desktop (Windows/MacOSX/Ubuntu) users can join using this (secure/private) URL: <a href="./file-sharing.html#' + roomid + '" target="_blank">file-sharing.html#' + roomid + '</a>';

                    // if (isRoomEists) { }
                    appendLog(message);

                    if(document.getElementById('room-id')) {
                        if(innerWidth > 500) {
                          document.getElementById('room-id').parentNode.innerHTML = 'Joined room: ' + roomid;
                        }
                        else {
                          document.getElementById('room-id').parentNode.innerHTML = 'Joined room:<br/>' + roomid;
                        }
                    }

                    connection.getSocket(function(socket) {
                      socket.on('disconnect', function() {
                         appendLog('Seems disconnected.', 'red');
                      });
                      socket.on('connect', function() {
                         location.reload();
                      });
                      socket.on('error', function() {
                         location.reload();
                      });
                    });

                    window.addEventListener('offline', function() {
                      appendLog('Seems disconnected.', 'red');
                    }, false);
                });

                window.connection = connection;
            }

            function setFileProgressBarHandlers(connection) {
                var progressHelper = {};

                // www.RTCMultiConnection.org/docs/onFileStart/
                connection.onFileStart = function(file) {
                    if (connection.fileReceived[file.size + file.name]) return;

                    var div = document.createElement('div');
                    div.style.borderBottom = '1px solid black';
                    div.style.padding = '2px 4px';
                    div.id = file.uuid;

                    var message = '';
                    if (file.userid == connection.userid) {
                        message += 'Sharing with:' + file.remoteUserId;
                    } else {
                        message += 'Receiving from:' + file.userid;
                    }

                    message += '<br/><b>' + file.name + '</b>.';
                    message += '<br/>Size: <b>' + bytesToSize(file.size) + '</b>';
                    message += '<br/><label>0%</label> <progress></progress>';

                    if(file.userid !== connection.userid) {
                        message += '<br/><button id="resend">Receive Again?</button>';
                    }

                    div.innerHTML = message;

                    connection.filesContainer.insertBefore(div, connection.filesContainer.firstChild);

                    if(file.userid !== connection.userid || div.querySelector('#resend')) {
                        div.querySelector('#resend').onclick = function(e) {
                            e.preventDefault();
                            this.onclick = function() {};

                            if(connection.fileReceived[file.size + file.name]) {
                                delete connection.fileReceived[file.size + file.name];
                            }
                            connection.send({
                                yesIWannaReceive: true,
                                fileName: file.name
                            }, file.userid);

                            div.parentNode.removeChild(div);
                        };
                    }

                    if (!file.remoteUserId) {
                        progressHelper[file.uuid] = {
                            div: div,
                            progress: div.querySelector('progress'),
                            label: div.querySelector('label')
                        };
                        progressHelper[file.uuid].progress.max = file.maxChunks;
                        return;
                    }

                    if (!progressHelper[file.uuid]) {
                        progressHelper[file.uuid] = {};
                    }

                    progressHelper[file.uuid][file.remoteUserId] = {
                        div: div,
                        progress: div.querySelector('progress'),
                        label: div.querySelector('label')
                    };
                    progressHelper[file.uuid][file.remoteUserId].progress.max = file.maxChunks;
                };

                // www.RTCMultiConnection.org/docs/onFileProgress/
                connection.onFileProgress = function(chunk) {
                    if (connection.fileReceived[chunk.size + chunk.name]) return;

                    var helper = progressHelper[chunk.uuid];
                    if (!helper) {
                        return;
                    }
                    if (chunk.remoteUserId) {
                        helper = progressHelper[chunk.uuid][chunk.remoteUserId];
                        if (!helper) {
                            return;
                        }
                    }

                    helper.progress.value = chunk.currentPosition || chunk.maxChunks || helper.progress.max;
                    updateLabel(helper.progress, helper.label);
                };

                // www.RTCMultiConnection.org/docs/onFileEnd/
                connection.onFileEnd = function(file) {
                    if (connection.fileReceived[file.size + file.name]) return;

                    var div = document.getElementById(file.uuid);
                    if (div) {
                        div.parentNode.removeChild(div);
                    }

                    if (file.remoteUserId === connection.userid) {
                        previewFile(file);

                        connection.fileReceived[file.size + file.name] = file;

                        var message = 'Successfully received file';
                        message += '<br/><b>' + file.name + '</b>.';
                        message += '<br/>Size: <b>' + bytesToSize(file.size) + '</b>.';
                        message += '<br/><a href="' + file.url + '" target="_blank" download="' + file.name + '">Download</a>';
                        var div = appendLog(message);
                        return;
                    }

                    var message = 'Successfully shared file';
                    message += '<br/><b>' + file.name + '</b>.';
                    message += '<br/>With: <b>' + file.remoteUserId + '</b>.';
                    message += '<br/>Size: <b>' + bytesToSize(file.size) + '</b>.';
                    appendLog(message);
                };

                function updateLabel(progress, label) {
                    if (progress.position === -1) {
                        return;
                    }

                    var position = +progress.position.toFixed(2).split('.')[1] || 100;
                    label.innerHTML = position + '%';
                }
            }

            function bytesToSize(bytes) {
                var k = 1000;
                var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
                if (bytes === 0) {
                    return '0 Bytes';
                }
                var i = parseInt(Math.floor(Math.log(bytes) / Math.log(k)), 10);
                return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
            }

            function onFileSelected(file) {
                var innerHTML = 'You selected:<br/><b>' + file.name + '</b><br/>Size: <b>' + bytesToSize(file.size) + '</b>';
                appendLog(innerHTML);

                lastSelectedFile = file;

                if (connection) {
                    connection.send({
                        doYouWannaReceiveThisFile: true,
                        fileName: file.size + file.name
                    });
                }
            }

            var numberOfUsers = document.getElementById('number-of-users');

            function incrementOrDecrementUsers() {
                numberOfUsers.innerHTML = connection ? connection.getAllParticipants().length : 0;
            }

            var logsDiv = document.getElementById('logs');

            function appendLog(html, color) {
                var div = document.createElement('div');
                div.innerHTML = '<p>' + html + '</p>';
                logsDiv.insertBefore(div, logsDiv.firstChild);

                if(color) {
                  div.style.color = color;
                }

                return div;
            }

            window.onerror = console.error = function() {
                var error = JSON.stringify(arguments);
                if(error.indexOf('Blocked a frame with origin') !== -1) {
                  return;
                }
                appendLog('Error:<br/>' + error, 'red')
            };

            function previewFile(file) {
                btnSelectFile.style.left = '5px';
                btnSelectFile.style.right = 'auto';
                btnSelectFile.style.zIndex = 10;
                btnSelectFile.style.top = '5px';
                btnSelectFile.style.outline = 'none';

                document.querySelector('.overlay').style.display = 'none';
                iframe.style.display = 'block';

                iframe.onload = function() {
                    Array.prototype.slice.call(iframe.contentWindow.document.body.querySelectorAll('*')).forEach(function(element) {
                        element.style.maxWidth = '100%';
                    });

                    if (!file.type || fileNameMatches || file.type.match(/image|video|audio|pdf/g) || iframe.src.indexOf('data:image/png') !== -1 || iframe.src.toLowerCase().search(/.png|.jpeg|.jpg|.gif/g) !== -1) {
                        iframe.contentWindow.document.body.style.textAlign = 'center';
                        iframe.contentWindow.document.body.style.background = 'black';
                        iframe.contentWindow.document.body.style.color = 'white';
                        return;
                    }
                    iframe.contentWindow.document.body.style.textAlign = 'left';
                    iframe.contentWindow.document.body.style.background = 'white';
                    iframe.contentWindow.document.body.style.color = 'black';
                };

                var fileNameMatches = (file.name || '').toLowerCase().match(/.webm|.wav|.pdf|.txt|.js|.css|.cs|.png|.jpg|.jpeg|.gif/g);
                if (fileNameMatches) {
                    iframe.src = URL.createObjectURL(file);
                } else {
                    iframe.src = 'https://www.webrtc-experiment.com/images/unknown-file.png';
                }
            }

            setupWebRTCConnection();
        }

        window.addEventListener('online', function() {
          location.reload();
        }, false);

        // drag-drop support
        document.addEventListener('dragover', function(e) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
        }, false);

        document.addEventListener('drop', function(e) {
          e.preventDefault();
          e.stopPropagation();

          if(!e.dataTransfer.files || !e.dataTransfer.files.length) {
            return;
          }

          var file = e.dataTransfer.files[0];

          if(!connection) {
            document.getElementById('join-room').onclick();
          }

          btnSelectFile.onclick(file);
        }, false);
