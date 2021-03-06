import { Observable, Subject } from 'rxjs/Rx';
import * as config from 'config';
import * as minimist from 'minimist';
import * as io from 'socket.io-client';
import { WaterRower } from 'waterrower';
import * as leftpad from 'leftpad';

enum LogLevel { Debug, Information, Warning, Error, Fatal }
let logLevel: LogLevel = LogLevel.Information;

//command line arguments
let args = minimist(process.argv.slice(2));
let name = args["n"]
    || args["name"]
    || (config.has('name') ? config.get('name') : undefined)
    || `Rower ${leftpad(Math.floor(Math.random() * 10000), 4, '0')}`;
let socketServerUrl = args["s"]
    || args["socket-server-url"]
    || (config.has('socketServerUrl') ? config.get('socketServerUrl') : undefined)
    || 'http://localhost:8080';
let simulationMode = args["m"]
    || args["simulation-mode"]
    || (config.has('simulationMode') ? config.get('simulationMode') : undefined);
let autoStart = args["a"]
    || args["auto-start"]
    || (config.has('autoStart') ? config.get('autoStart') : false);
let boostMode = args["b"]
    || args["boost"]
    || (config.has('boost') ? config.get('boost') : false)

//create waterrower
let waterrower = new WaterRower({ datapoints: ['ms_distance', 'm_s_total', 'm_s_average', 'total_kcal'] });

log(`Using ${name} as rower name.`);
log(`Attempting to connect to ${socketServerUrl}`);
if (simulationMode) log('This machine is running in simulation mode.');

let subs = [];

//wire up to the socket server
var socket = io(socketServerUrl);
socket.on('connect', () => {
    //send a check-in message so the rower can be added to the list
    console.log('sending rower-checkin message')
    socket.send({ message: 'rower-checkin', name: name });
});

//when we get an incoming socket message...
socket.on("message", data => {

    //if it's a session-start then start the rower
    // if (data.message == 'session-start') start(data.distance);
});

if (autoStart) start(500);

//start the rower
function start(distance: number) {
    subs.forEach(s => s.unsubscribe());
    waterrower.reset();
    waterrower.defineDistanceWorkout(distance);
    if (simulationMode) waterrower.startSimulation();
}

//every 3-9s change the random factor
let k = Math.random() * 2;
setInterval(() => {
    if(Math.random() > 0.97) {
        k *= 1.4;
        console.log(`BOOST! (k=${k}`);
    }
}, 1000)

//subscribe to the waterrower datapoints stream
subs.push(waterrower.datapoints$.subscribe(d => {
    //we're only interested in four datapoints
    let values = waterrower.readDataPoints(['ms_distance', 'm_s_total', 'm_s_average', 'total_kcal']);
    let msg = {
        time: d.time,
        message: "strokedata",
        name: name,
        ms_distance: values['ms_distance'] * k,
        m_s_total: values['m_s_total'] / 100, //convert cm to m
        m_s_average: values['m_s_average'] / 100, //convert cm to m
        total_kcal: values['total_kcal'] / 1000 //convert to calories
    };
    // console.log(msg.ms_distance);

    //send sockets
    socket.send(msg);

    log(`Sent ${JSON.stringify(msg)}`, LogLevel.Debug);
}));

function log(msg: string, level: LogLevel = LogLevel.Information) {
    if (level >= logLevel) console.log(msg);
}