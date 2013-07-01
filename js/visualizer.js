// constants for the visualizer
var options = {
    debug: true,
    baseSpeed: 30,              // multiplier for how fast all arcs go
    freqMax: 200,                // end of the frequency range to scan 
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
        kickMul: 2,             // multiply this by the ratio for increase in kick speed
        kickMax: 10             // increase at most this number
    },
    bigKick: {
        compare: 2.7,           // same as effects as small kick
        intensity: 700,
        magnitude: 0.25,
        time: 1000,
        kickMul: 1.5
    },
    kickExponent: 1,          // kickSpeed value is raised to this power
    kickCooldown: 2,           // rate at which kick decreases (smaller is faster)
    speedInc: {
        threshold: 200,         // arcs speed up if avgIntensity is at least this
        divisor: 200,           // increased speed is divided by this
        exponent: 2           // multiplier increases by this exponent
    },
};

function log() {
    if (options.debug) {
        console.log.apply(console, arguments);
    }
}

// Set up splash screen
var animSpeed = options.debug ? 0 : 500;
$('.selectpicker').selectpicker().change(function(){
    var val = $(this).val();
    $('#container').delay(animSpeed).fadeOut(animSpeed, function() {
        log("Loading " + val);
        // when they select a value, load that into Dancer
        dancer.load({src: val});
    });
});

if (options.debug) {
    $('.selectpicker').selectpicker('val', 'callmemaybe.mp3');
}

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
    log("Loaded, now playing");
    this.play();
});
var kick = dancer.createKick({frequency: [0, options.freqMax]});

// move the whole system by the vector input
function transform(vec) {
    group.position += vec;
    center += vec;
    circ.position += vec;
}

function weightedAverage(a, b, weight) {
    return a * weight + b * (1 - weight);
}

// return a weighted average between two colors
function weightedColor(a, b, weight){
    return new Color(weightedAverage(a.red, b.red, weight),
                     weightedAverage(a.green, b.green, weight),
                     weightedAverage(a.blue, b.blue, weight));
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

function stdDev(arr, mean) {
    var sum = 0;
    arr.forEach(function(n){
        sum += Math.pow(n - mean, 2);
    });
    return Math.sqrt(sum / arr.length);
}

// get time in milliseconds
function time(){
    return new Date().getTime();
}

function getIntensity() {
    return Math.round(dancer.getFrequency(0, options.freqMax) * 10000);
}

kickers = []
function Kicker(args) {
    $.extend(this, args);
    this.magThreshold = 0;
    this.lastKick = 0;
    kickers.push(this);
}

Kicker.prototype =  {
    update: function() {
        var 
        intensity            = getIntensity(),
        localAvg             = average(localIntensity),
        comparativeIntensity = intensity / localAvg,               // current intensity vs local average
        curTime              = time(),
        magnitude            = kick.maxAmplitude(kick.frequency),  // get highest amplitude of frequency spectrum
        s                    = stdDev(localIntensity, localAvg),
        deviations           = (intensity - localAvg) / s,
        kicked               = false;

        // sufficient conditions for finding a beat:
        // 1. intensity is X the local average OR
        // 2. intensity is Y the local average, itensity is > Z, and high amplitude is close to threshold OR
        // 3. amplitude is above threshold and a decaying higher threshold
        // 4. std deviation is small enough and intensity is far enough from the mean
        var kickEnough = (comparativeIntensity > this.compare1) ||
            (comparativeIntensity > this.compare2 && intensity > this.intensity && 
             (magnitude > this.threshold - this.magnitude)
            ) || (magnitude > this.magThreshold && magnitude > this.threshold) ||
            (s < 80 && deviations > 1.7);

        // also check that we're not spamming kicks and the song is loud enough
        if ((curTime - this.lastKick > this.time) && kickEnough &&
            (localAvg > options.localThreshold || 
             (intensity - localAvg > options.localDiffThreshold) || 
             (magnitude > this.threshold - this.magnitude) ||
            s < 80))
        {
            // reset currThreshold (it decays over time)
            this.magThreshold = magnitude;
            this.lastKick = curTime;
            this.onKick(comparativeIntensity, magnitude);
            kicked = true;
        }

        this.magThreshold -= options.decay;

        return kicked;
    }
}

var 
avgIntensity   = 1,      // weighted average intensity of the song
localIntensity = [],     // average intensity of last 100 frames
kickSpeed      = 1;      // when we hear a beat, increase kickSpeed

new Kicker($.extend(options.smallKick, {
    onKick: function(comparativeIntensity, magnitude) {
        console.log('small kick');
        // add to the kickSpeed (increases speed of rings)
        kickSpeed += Math.max(options.smallKick.kickMul * comparativeIntensity, options.smallKick.kickMax);
    }
}));

new Kicker($.extend(options.bigKick, {
    onKick: function(args) {
        arcs.forEach(function(arc) {
            arc.toColor = new Color(Math.random(), Math.random(), Math.random());
        });
        // make arcs spin even faster
        kickSpeed *= options.bigKick.kickMul;
    }
}));

function onFrame(event) {

    if (!dancer.isPlaying() || !event.delta) {
        return;
    }

    var 
    intensity = getIntensity(),
    kicked    = false;
    avgIntensity = intensity * 0.05 + avgIntensity * 0.95;
    localIntensity.push(intensity);

    if (localIntensity.length > options.localSamples) {
        localIntensity.shift();
        kickers.forEach(function(kicker){ if(kicker.update()) kicked = true; });
    } 

    // apply effects to arcs
    arcs.forEach(function(arc) {

        // calculate base speed based on time after last framev
        var speed = event.delta * options.baseSpeed * arc.speedMult;
        
        // add speed from kicks (toned down a wee bit)
        speed *= Math.pow(kickSpeed, options.kickExponent);

        // increase speed as average intensity rises 
        speed *= (avgIntensity > options.speedInc.threshold) ? Math.max(1, Math.pow(avgIntensity / options.speedInc.divisor, options.speedInc.exponent)) : 1;
        
        // perform the rotation at given speed
        if (!arc.clockwise) {
            speed = 360 - speed;
        }
        
        arc.rotate(speed, center);
        
        // reduce kickSpeed
        if (kickSpeed != 1) {
            kickSpeed = Math.max(kickSpeed - event.delta * kickSpeed / options.kickCooldown, 1)
        }

        // if child color was changed on a big beat, interpolate to it
        if (!closeEnough(arc.strokeColor, arc.toColor)) {
            arc.strokeColor = weightedColor(arc.strokeColor, arc.toColor, 0.90);
        }

        if (kicked) {
            arc.strokeWidth = 10;
        }
        arc.strokeWidth = weightedAverage(arc.strokeWidth, options.arcs.width, 0.9);
    });
}
