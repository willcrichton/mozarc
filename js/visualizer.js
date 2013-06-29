// Set up splash screen
$('.selectpicker').selectpicker().change(function(){
    var val = $(this).val();
    $('#container').delay(500).fadeOut(500, function() {
        dancer.load({src: val});
    });
});

// constants for the visualizer
var options = {
    center: new Point(view.viewSize.width / 2, view.viewSize.height / 2),
    baseSpeed: 30,
    strokeWidth: 5,
    song: 'stress.mp3'
};

// create a center
var circ = new Path.Circle(options.center, 10);
circ.fillColor = 'white';

// generate list of arcs with random positions/sizes
var arcs = [];
for (var i = 0; i < 10; i++) {
    var from = options.center + [(i + 1) * 30, 0];
    from = from.rotate(Math.random() * 360, options.center);
    var angle = Math.random() * 100 + 170;
    var through = from.rotate(angle/2, options.center);
    var to = from.rotate(angle, options.center);
    var arc = new Path.Arc(from, through, to);
    arc.strokeColor = new Color(Math.random(), Math.random(), Math.random());
    arc.toColor     = arc.strokeColor; 
    arc.clockwise   = i % 2;
    arc.strokeWidth = options.strokeWidth;
    arc.speedMult   = 0.8 + (Math.random() / 2);
    arcs.push(arc);
}

// group allows us to move them all at the same time
var group = new Group(arcs);

// dancer from dancer.js
var dancer = new Dancer();
dancer.bind('loaded', function() {
    $('canvas').fadeIn(500);
    this.play();
});
var kick = dancer.createKick({frequency: [0, 40]});

// move the whole system by the vector input
function transform(vec) {
    group.position += vec;
    options.center += vec;
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
threshold      = 0.4,    // threshold for max amplitude beat check
currThreshold  = 0;      // second threshold for max amp check 

function onFrame(event) {

    if (!dancer.isPlaying()) {
        return;
    }

    // calculate intensity
    var intensity = Math.round(dancer.getFrequency(0, 20) * 10000);
    avgIntensity = intensity * 0.05 + avgIntensity * 0.95;
    localIntensity.push(intensity);

    if (localIntensity.length > 100) {

        localIntensity.shift();

        var 
        localAvg             = average(localIntensity),            // average of last 100 frames
        comparativeIntensity = intensity / localAvg,               // current intensity vs local average
        curTime              = time(),
        magnitude            = kick.maxAmplitude(kick.frequency);  // get highest amplitude of frequency spectrum

        // sufficient conditions for finding a beat:
        // 1. intensity is twice the local average OR
        // 2. intensity is 1.5 the local average, itensity is > 500, and high amplitude is close to threshold OR
        // 3. amplitude is above threshold and a decaying higher threshold
        var kickEnough = (comparativeIntensity > 2) ||
            (comparativeIntensity > 1.5 && intensity > 500 && (magnitude > threshold - 0.1)) ||
            (magnitude > currThreshold && magnitude > threshold);

        // also check that we're not spamming kicks and the song is loud enough
        if ((curTime - lastKick > 200) && kickEnough &&
            (localAvg > 200 || (intensity - localAvg > 150) || (magnitude > threshold - 0.1)))
        {
            // reset currThreshold (it decays over time)
            currThreshold = magnitude;
            // add to the kickSpeed (increases speed of rings)
            kickSpeed += 3 * Math.max(comparativeIntensity, 5);

            // conditions for a bigger beat (closer to, say, a drop)
            // 1. intensity is 2.7 the local average
            // 2. magnitude is over 0.15 + threshold
            // 3. intensity is greater than 700
            // also we do these less frequently than small kicks
            if ((comparativeIntensity > 2.7 || magnitude > threshold + 0.15 || intensity > 700) &&
                curTime - lastKick > 1000)
            {
                // change color of arcs
                arcs.forEach(function(child) {
                    child.toColor = new Color(Math.random(), Math.random(), Math.random());
                });
                // make arcs spin even faster
                kickSpeed += 10;
            }
            
            // update lastKick
            lastKick = curTime;
        }

        // decay the max amplitude threshold
        currThreshold -= 0.01;
    } 

    // apply effects to arcs
    arcs.forEach(function(arc) {
        // calculate base speed based on time after last framev
        var speed = event.delta * options.baseSpeed * arc.speedMult;
        
        // add speed from kicks (toned down a wee bit)
        speed *= Math.pow(kickSpeed, 0.8);

        // increase speed as average intensity rises 
        speed *= avgIntensity > 300 ? Math.max(1, Math.pow(avgIntensity / 300, 1.3)) : 1;
        
        // perform the rotation at given speed
        if (!arc.clockwise) {
            speed = 360 - speed;
        }
        arc.rotate(speed, options.center);
        
        // reduce kickSpeed
        if (kickSpeed > 1) {
            kickSpeed -= event.delta * 6;
        }

        // if child color was changed on a big beat, interpolate to it
        if (!closeEnough(arc.strokeColor, arc.toColor)) {
            arc.strokeColor = weightedColor(arc.strokeColor, arc.toColor, 0.90);
        }
    });
}
