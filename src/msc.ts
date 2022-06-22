import * as easymidi from "easymidi";
import SysTray from "systray";
import * as fs from "fs";
import * as path from "path";
import {showConsole, hideConsole} from "node-hide-console-window";
hideConsole();

const debug = true;

const icon = fs.readFileSync(path.join(__dirname, `/logo.ico`));

const systray = new SysTray({
	menu: {
		// you should using .png icon in macOS/Linux, but .ico format in windows
		icon: icon.toString("base64"),
		title: "Emmaus-MIDI-MSC",
		tooltip: "Midi <--> Dot2",
		items: [
			{
				title: "Exit",
				tooltip: "Close",
				checked: false,
				enabled: true,
			},
		],
	},
	debug: debug,
	copyDir: true, // copy go tray binary to outside directory, useful for packing tool like pkg.
});

systray.onClick((action) => {
	if (action.seq_id === 0) {
		systray.kill();
	}
});

//Actuall Important Code

const dot2MSC = require("mamsc");

//Functions
function ExecToEP(exec: number) {
	return Math.round(exec) + 0.1;
}
function EPtoExec(ep: number) {
	return Math.round(ep - 0.1);
}

// Connect MIDI Board or EXIT for Autostart
const midiDeviceName = "Maschine Jam - 1";

let midiInputs = easymidi.getInputs();
console.log(midiInputs);

if (!midiInputs.includes(midiDeviceName)) {
	systray.kill();
}
const midiInput = new easymidi.Input(midiDeviceName);
const midiOutput = new easymidi.Output(midiDeviceName);

//MSC DOT2 Connection
const MSCSender = dot2MSC.out(6005);
const MSCReceiver = dot2MSC.in(6004);

var activeCues: { [key: string]: number } = {};

//MIDI Inputs
midiInput.on("cc", function (fader) {
	MSCSender.fader((fader.value / 127) * 100, ExecToEP(fader.controller));
});
midiInput.on("noteon", function (cueTrigger) {
	if (cueTrigger.velocity == 1 && cueTrigger.note != 0)
		MSCSender.goto(cueTrigger.note, ExecToEP(cueTrigger.channel));
	else if (cueTrigger.velocity == 0 || cueTrigger.note == 0){
		if(cueTrigger.channel == 2){
			MSCSender.fire(50);
		} else {
			MSCSender.off(ExecToEP(cueTrigger.channel));
		}
	}
		
});
midiInput.on("position",function(pos){
	MSCSender.fire(pos.value);
})

//Dot2 MSC Inputs
MSCReceiver.on("off", function (ep: number) {
	var exec = EPtoExec(ep);
	if (activeCues.hasOwnProperty(exec)) {
		if (exec >= 0 && exec <= 15)
			midiOutput.send("noteoff", {
				note: activeCues[exec],
				channel: exec as easymidi.Channel,
				velocity: 0,
			});
	}
	midiOutput.send("noteon", {
		note: 0,
		channel: exec as easymidi.Channel,
		velocity: 1,
	});
	activeCues[exec] = 0;
});

MSCReceiver.on("goto", function (ep: number, cue: number) {
	var exec = EPtoExec(ep);
	if (activeCues.hasOwnProperty(exec) && activeCues[exec] != cue) {
		if (exec >= 0 && exec <= 15)
			midiOutput.send("noteoff", {
				note: activeCues[exec],
				channel: exec as easymidi.Channel,
				velocity: 0,
			});
	}
	if (exec >= 0 && exec <= 15){
		midiOutput.send("noteon", {
			note: cue,
			channel: exec as easymidi.Channel,
			velocity: 1,
		});
	}
	activeCues[exec] = cue;
});

MSCReceiver.on(
	"fader",
	function (
		position: number | { percent: number; value: number },
		ep: number,
		fade?: number
	) {
		var faderPerc;
		if (typeof position == "number") faderPerc = position;
		else faderPerc = position.percent;

		midiOutput.send("cc", {
			controller: EPtoExec(ep),
			value: (faderPerc / 100) * 127,
			channel: 0,
		});
	}
);

if(debug){
	MSCReceiver.on(
		"fader",
		function (
			position: number | { percent: number; value: number },
			ep: number,
			fade?: number
		) {
			console.log(position, ep, fade);
		}
	);
}