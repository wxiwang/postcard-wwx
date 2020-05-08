// server.js
// where your node app starts

// include modules
const express = require('express');

const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
const sql = require("sqlite3").verbose();

const postcardDB = new sql.Database("postcards.db");
const FormData = require("form-data");

// Actual table creation; only runs if "shoppingList.db" is not found or empty
// Does the database table exist?
let cmd = " SELECT name FROM sqlite_master WHERE type='table' AND name='PostcardTable' ";
postcardDB.get(cmd, function (err, val) {
    console.log(err, val);
    if (val == undefined) {
        console.log("No database file - creating one");
        createPostcardsDB();
    } else {
        console.log("Database file found");
    }
});





function createPostcardsDB() {
  // explicitly declaring the rowIdNum protects rowids from changing if the 
  // table is compacted; not an issue here, but good practice
  const cmd = 'CREATE TABLE PostcardTable ( rowIdNum INTEGER PRIMARY KEY, randomStr TEXT, image TEXT, message TEXT, font TEXT, color TEXT)';
  postcardDB.run(cmd, function(err, val) {
    if (err) {
      console.log("Database creation failure",err.message);
    } else {
      console.log("Created database");
    }
  });
}


let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, __dirname+'/images')    
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
// let upload = multer({dest: __dirname+"/assets"});
let upload = multer({storage: storage});


// begin constructing the server pipeline
const app = express();

// A middleware function to handles the GET query /shoppingList
// Observe that it either ends up sending the HTTP response or calls next(), so it
// is a valid middleware function. 
function handleRandomStr(request, response, next) {
  let cmd = "SELECT RandomStr FROM PostcardTable"
  postcardDB.all(cmd, function (err, rows) {
    if (err) {
      console.log("Database reading error", err.message)
      next();
    } else {
      // send shopping list to browser in HTTP response body as JSON
      response.json(rows);
      console.log("rows",rows);
    }
  });
}

// Serve static files out of public directory
app.use(express.static('public'));

// Also serve static files out of /images
app.use("/images",express.static('images'));

// Handle GET request to base URL with no other route specified
// by sending creator.html, the main page of the app
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/public/creator.html');
});


app.get("/showPostcard",function(req,res){
  console.log("answering query");
  let str = req.query.id;
  console.log(str);
  cmd = 'SELECT * FROM PostcardTable WHERE randomStr = ?';
  postcardDB.get(cmd,str,function(err,row){
    if (err) {
      console.log("Database reading error", err.message)
      
    } else {
      // send shopping list to browser in HTTP response body as JSON
      res.json(row);
      console.log("row",row);
    }
  })
});


// Next, the the two POST AJAX queries

// Handle a post request to upload an image. 
app.post('/upload', upload.single('newImage'), function (request, response) {
  console.log("Recieved",request.file.originalname,request.file.size,"bytes")
  if(request.file) {
    // file is automatically stored in /images, 
    // even though we can't see it. 
    // We set this up when configuring multer
    sendMediaStore("/images/"+request.file.originalname,request,response);
    response.end("recieved "+request.file.originalname);
    let path = "images/"+request.file.originalname;
    
    fs.unlink(path, (err) => {
      if (err) {
        console.error(err)
        return
      }
    //file removed
    })
    
  }
  else throw 'error';
});


// Handle a post request containing JSON
app.use(bodyParser.json());
// gets JSON data into req.body
app.post('/saveDisplay', function (req, res,next) {
  console.log(req.body);
  // write the JSON into postcardData.json
  /*fs.writeFile(__dirname + '/public/postcardData.json', JSON.stringify(req.body), (err) => {
    if(err) {
      res.status(404).send('postcard not saved');
    } else {
      res.send("All well")
    }
  })*/
  
  let image = req.body.image;
  let color = req.body.color;
  let font = req.body.font;
  let message = req.body.message;
  let randomStr = createRandomString();
  console.log(message);
  cmd = "INSERT INTO PostcardTable ( randomStr, image, message, font, color) VALUES (?,?,?,?,?) ";
  postcardDB.run(cmd,randomStr,image,message,font,color,function(err){
    if(err){
      console.log("DB insert error: ",err.message);
      next();
    }else {
      console.log(randomStr);
      let newId = this.lastID; // the rowid of last inserted item
      res.send(randomStr);
    }
  })
});


// The GET AJAX query is handled by the static server, since the 
// file postcardData.json is stored in /public

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});

function createRandomString(){
  return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
}

function sendMediaStore(filename, serverRequest, serverResponse) {
  let apiKey = "0nj1xdfyo0";
  if (apiKey === undefined) {
    serverResponse.status(400);
    serverResponse.send("No API key provided");
  } else {
    // we'll send the image from the server in a FormData object
    let form = new FormData();
    
    // we can stick other stuff in there too, like the apiKey
    form.append("apiKey", apiKey);
    // stick the image into the formdata object
    form.append("storeImage", fs.createReadStream(__dirname + filename));
    // and send it off to this URL
    form.submit("http://ecs162.org:3000/fileUploadToAPI", function(err, APIres) {
      // did we get a response from the API server at all?
      if (APIres) {
        // OK we did
        console.log("API response status", APIres.statusCode);
        // the body arrives in chunks - how gruesome!
        // this is the kind stream handling that the body-parser 
        // module handles for us in Express.  
        let body = "";
        APIres.on("data", chunk => {
          body += chunk;
        });
        APIres.on("end", () => {
          // now we have the whole body
          if (APIres.statusCode != 200) {
            serverResponse.status(400); // bad request
            serverResponse.send(" Media server says: " + body);
          } else {
            serverResponse.status(200);
            //serverResponse.send(body);
          }
        });
      } else { // didn't get APIres at all
        serverResponse.status(500); // internal server error
        serverResponse.send("Media server seems to be down.");
      }
    });
  }
}

