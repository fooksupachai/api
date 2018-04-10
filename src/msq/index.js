import EventEmitter from 'events';
import zmq from 'zeromq';

const receivingSocket = zmq.socket('pull');

export const eventEmitter = new EventEmitter();

receivingSocket.on('message', function(jsonMessageStr){
  // TODO - Receiving Queue
  // In case of messages arrive before listener function is added.

  const message = JSON.parse(jsonMessageStr);

  eventEmitter.emit('message', message);
});

export const send = (receivers, message) => {
  const jsonMessageStr = JSON.stringify(message);
  receivers.forEach(receiver => {
    const sendingSocket = zmq.socket('push');
    sendingSocket.connect(`tcp://${receiver.ip}:${receiver.port}`);
    sendingSocket.send(jsonMessageStr);

    // TO BE REVISED
    // When should we disconnect the socket?
    // If the socket is disconnected, all the messages in queue will be lost. 
    // Hence, the receiver won't get the messages.
    sendingSocket.disconnect(`tcp://${receiver.ip}:${receiver.port}`);
  });
};
