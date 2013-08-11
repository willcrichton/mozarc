<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link href="css/bootstrap-select.min.css" rel="stylesheet">
    <link href="css/style.css" rel="stylesheet">
  </head>
  <body>
    <script> var _toLoad; </script>
    <?php if(isset($_FILES['song'])): 
      move_uploaded_file($_FILES['song']['tmp_name'], 'uploads/' . $_FILES['song']['name']); ?>
    <script>
      _toLoad = 'uploads/<?=$_FILES['song']['name']?>';
    </script>
    <? else: ?>
    <div id="container">
      <h1>moz<strong>arc</strong></h1>
      <select class="selectpicker">
        <option>Select a song</option>
        <option value="stress.mp3">Stress - Justice</option>
        <option value="callmemaybe.mp3">Call Me Maybe - CRJ</option>
        <option value="gangnamstyle.mp3">Gangnam Style - Psy</option>
        <option value="derezzed.mp3">Derezzed - Daft Punk</option>
      </select>
      <div>- OR -</div>
      <form method="POST" enctype="multipart/form-data">
        <input type="file" name="song" />
      </form>
    </div>
    <?php endif; ?>
    <canvas id="visualizer" resize></canvas>
    <script src="js/jquery.min.js"></script>
    <script src="js/bootstrap.min.js"></script>
    <script src="js/bootstrap-select.min.js"></script>
    <script src="js/paper-min.js"></script>
    <script src="js/dancer.min.js"></script>
    <script src="js/fft.js"></script>
    <script src="js/visualizer.js" type="text/paperscript" canvas="visualizer"></script>
  </body>
</html>

  