// constants for the visualizer
var options = {
    baseSpeed: 30,              // multiplier for how fast all arcs go
    freqMax: 40,                // end of the frequency range to scan 
    arcs: {                     
        length: [170, 270],     // arcs will be between [x,y] degrees long
        width: 5,               
        num: 10,                // how many arcs will be shown
        spacing: 30
    },
    threshold: 0.4,             // for max-amp-based kick detection
    localThreshold: 200,        // can't kick if local average isn't high enough AND
    localDiffThreshold: 150,    // can't kick if diff between current intensity and local average is too small
    localSamples: 60,           // number of frames to count for localIntensity 
    decay: 0.02,                // how rapidly the currThreshold decays in max-amp kick detection
    smallKick: {
        compare1: 2,            // kick if intensity / localIntensity > this
        compare2: 1.5,          // or if ratio is > this and
        intensity: 500,         //    has intensity > this
        magnitude: -0.1,        // or if magnitude is > this + threshold
        time: 200,              // wait at least this many milliseconds between kicks
        kickMul: 3,             // multiply this by the ratio for increase in kick speed
        kickMax: 15             // increase at most this number
    },
    bigKick: {
        compare: 2.7,           // same as effects as small kick
        intensity: 700,
        magnitude: 0.15,
        time: 1000,
        kickMul: 2
    },
    kickExponent: 0.8,          // kickSpeed value is raised to this power
    kickCooldown: 6,            // kickSpeed decreases with this multiplier
    speedInc: {
        threshold: 300,         // arcs speed up if avgIntensity is at least this
        divisor: 300,           // increased speed is divided by this
        exponent: 1.2           // multiplier increases by this exponent
    },
};

// Set up splash screen
$('.selectpicker').selectpicker().change(function(){
    var val = $(this).val();
    $('#container').delay(500).fadeOut(500, function() {
        // when they select a value, load that into Dancer
        dancer.load({src: val});
    });
});

// create a center at the center of the canvas
var center = new Point(view.viewSize.width / 2, view.viewSize.height / 2);
var circ = new Path.Circle(center, 10);
circ.fillColor = 'white';

// generate list of arcs with random positions/sizes
var arcs = [];
for (var i = 0; i < options.arcs.num; i++) {
    var from = center + [(i + 1) * options.arcs.spacing, 0];
    from = from.rotate(Math.random() * 360, center);
    var angle = options.arcs.length[0] + Math.random() * (options.arcs.length[1] - options.arcs.length[0]);
    var through = from.rotate(angle/2, center);
    var to = from.rotate(angle, center);
    var arc = new Path.Arc(from, through, to);
    arc.strokeColor = new Color(Math.random(), Math.random(), Math.random());
    arc.toColor     = arc.strokeColor; 
    arc.clockwise   = i % 2;
    arc.strokeWidth = options.arcs.width;
    arc.speedMult   = 0.8 + (Math.random() / 2);
    arcs.push(arc);
}

// group allows us to move them all at the same time
var group = new Group(arcs);

// dancer from dancer.js
// set up flash support for non-Chrome browsers
Dancer.setOptions({
    flashJS: 'js/soundmanager2.js',
    flashSWF: 'js/soundmanager2.swf'
});
// firefox adapter doesn't work nowadays
Dancer.adapters.moz = Dancer.adapters.flash;

// create a new dancer
var dancer = new Dancer();
// once a song is loaded, play it
dancer.bind('loaded', function() {
    $('canvas').fadeIn(500);
    this.play();
});
var kick = dancer.createKick({frequency: [0, options.freqMax]});

// move the whole system by the vector input
function transform(vec) {
    group.position += vec;
    center += vec;
    circ.position += vec;
}

// return a weighted average between two colors
function weightedColor(a, b, weight){
    return new Color(a.red * weight + b.red * (1 - weight),
                     a.green * weight + b.green * (1 - weight),
                     a.blue * weight + b.blue * (1 - weight));
}

// check if two colors are close enough
function closeEnough(a, b) {
    function close(c, d){ return Math.abs(c - d) < 0.01; }
    return close(a.red, b.red) && close(a.green, b.green) && close(a.blue, b.blue);
}

// return average of all values in an array
function average(arr) {
    var avg = 0;
    for(var i = 0; i < arr.length; i++) {
        avg += arr[i];
    }
    return avg / arr.length;
}

// get time in milliseconds
function time(){
    return new Date().getTime();
}

var 
avgIntensity   = 1,      // weighted average intensity of the song
localIntensity = [],     // average intensity of last 100 frames
kickSpeed      = 1,      // when we hear a beat, increase kickSpeed
lastKick       = time(),
currThreshold  = 0;      // second threshold for max amp check 

function onFrame(event) {

    if (!dancer.isPlaying()) {
        return;
    }

    // calculate intensity
    var intensity = Math.round(dancer.getFrequency(0, options.freqMax) * 10000);
    avgIntensity = intensity * 0.05 + avgIntensity * 0.95;
    localIntensity.push(intensity);

    if (localIntensity.length > options.localSamples) {

        localIntensity.shift();

        var 
        localAvg             = average(localIntensity),            // average of last 100 frames
        comparativeIntensity = intensity / localAvg,               // current intensity vs local average
        curTime              = time(),
        magnitude            = kick.maxAmplitude(kick.frequency);  // get highest amplitude of frequency spectrum

        // sufficient conditions for finding a beat:
        // 1. intensity is X the local average OR
        // 2. intensity is Y the local average, itensity is > Z, and high amplitude is close to threshold OR
        // 3. amplitude is above threshold and a decaying higher threshold
        var kickEnough = (comparativeIntensity > options.smallKick.compare1) ||
            (comparativeIntensity > options.smallKick.compare2 && intensity > options.smallKick.intensity && 
             (magnitude > options.threshold - options.smallKick.magnitude)
            ) || (magnitude > currThreshold && magnitude > options.threshold);

        // also check that we're not spamming kicks and the song is loud enough
        if ((curTime - lastKick > options.smallKick.time) && kickEnough &&
            (localAvg > options.localThreshold || 
             (intensity - localAvg > options.localDiffThreshold) || 
             (magnitude > options.threshold - options.smallKick.magnitude)))
        {
            // reset currThreshold (it decays over time)
            currThreshold = magnitude;
            // add to the kickSpeed (increases speed of rings)
            kickSpeed += Math.max(options.smallKick.kickMul * comparativeIntensity, options.smallKick.kickMax);

            // conditions for a bigger beat (closer to, say, a drop)
            // 1. intensity is X the local average
            // 2. magnitude is over Y + threshold
            // 3. intensity is greater than Z
            // also we do these less frequently than small kicks
            if ((comparativeIntensity > options.bigKick.intensity || 
                 magnitude > options.threshold + options.bigKick.magnitude || 
                 intensity > options.bigKick.intensity) &&
                curTime - lastKick > options.bigKick.time)
            {
                // change color of arcs
                arcs.forEach(function(arc) {
                    arc.toColor = new Color(Math.random(), Math.random(), Math.random());
                });
                // make arcs spin even faster
                kickSpeed *= options.bigKick.kickMul;
            }
            
            // update lastKick
            lastKick = curTime;
        }

        // decay the max amplitude threshold
        currThreshold -= options.decay;
    } 

    // apply effects to arcs
    arcs.forEach(function(arc) {
        // calculate base speed based on time after last framev
        var speed = event.delta * options.baseSpeed * arc.speedMult;
        
        // add speed from kicks (toned down a wee bit)
        speed *= Math.pow(kickSpeed, options.kickExponent);

        // increase speed as average intensity rises 
        speed *= avgIntensity > options.speedInc.threshold ? Math.max(1, Math.pow(avgIntensity / options.speedInc.divisor, options.speedInc.exponent)) : 1;
        
        // perform the rotation at given speed
        if (!arc.clockwise) {
            speed = 360 - speed;
        }
        arc.rotate(speed, center);
        
        // reduce kickSpeed
        if (kickSpeed > 1) {
            kickSpeed -= event.delta * options.kickCooldown;
        }

        // if child color was changed on a big beat, interpolate to it
        if (!closeEnough(arc.strokeColor, arc.toColor)) {
            arc.strokeColor = weightedColor(arc.strokeColor, arc.toColor, 0.90);
        }
    });
}
