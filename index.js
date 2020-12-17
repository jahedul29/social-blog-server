const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const port = 5000 || process.env.PORT;
require("dotenv").config();

// Password hashing package bcrypt
const bcrypt = require("bcrypt");
const saltRounds = 10;

const { USER } = require("./StaticFiles/roles");

const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId;
const { ACTIVE } = require("./StaticFiles/activeStatus");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n6je5.mongodb.net/dental-solution?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(fileUpload());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

client.connect((err) => {
  console.log("Database connected");

  // Performing usersCollection operations
  const userCollection = client.db(process.env.DB_NAME).collection("users");

  // Register endpoint
  app.post("/register", (req, res) => {
    req.body.role = req.body.role || USER;
    req.body.status = ACTIVE;
    bcrypt.hash(req.body.password, saltRounds).then(function (hash) {
      req.body.password = hash;
      userCollection
        .findOneAndUpdate(
          { email: req.body.email },
          { $setOnInsert: req.body },
          { upsert: true, returnNewDocument: true }
        )
        .then((result) => {
          if (!result.lastErrorObject.updatedExisting) {
            res.sendStatus(200);
          } else {
            res.sendStatus(409);
          }
        })
        .catch((err) => console.log(err));
    });
  });

  // Login endpoint
  app.post("/login", (req, res) => {
    userCollection.find({ email: req.body.email }).toArray((err, users) => {
      if (!users[0]) {
        res.sendStatus(404);
      } else if (users[0].status === 0) {
        res.sendStatus(403);
      } else if (users[0].email === req.body.email) {
        bcrypt
          .compare(req.body.password, users[0].password)
          .then(function (result) {
            if (result) {
              res.status(200).send(users[0]);
            } else {
              res.sendStatus(401);
            }
          })
          .catch((err) => console.log(err));
      } else {
        res.sendStatus(500);
      }
    });
  });

  // Endpoint for getting all/conditional users
  app.post("/users", (req, res) => {
    const filter = {
      role: req.body.role,
    };

    if (req.body.status) {
      filter.status = req.body.status;
    }

    userCollection.find(filter).toArray((err, users) => {
      if (users.length > 0) {
        res.status(200).send(users);
      } else {
        res.sendStatus(404);
      }
    });
  });

  // User update endpoint
  app.post("/updateUser", (req, res) => {
    const status = req.body.status === "Lock" ? 0 : 1;
    userCollection
      .updateOne({ _id: ObjectId(req.body.id) }, { $set: { status: status } })
      .then((result) => {
        if (result.modifiedCount > 0) {
          res.status(200).send(result.modifiedCount > 0);
        } else {
          res.sendStatus(404);
        }
      });
  });

  // Performing postsCollection operations
  const postsCollection = client.db(process.env.DB_NAME).collection("posts");

  // Posting endpoint
  app.post("/leavePost", (req, res) => {
    const { userName, email, textPost } = req.body;
    const file = req.files.image;
    const newImg = file.data;
    const encImg = newImg.toString("base64");

    var image = {
      contentType: file.mimetype,
      size: file.size,
      img: Buffer.from(encImg, "base64"),
    };

    const newPost = {
      userName,
      email,
      textPost,
      image,
      status: 0,
      createdAt: new Date(),
      comments: [],
    };

    postsCollection.insertOne(newPost).then((result) => {
      if (result.insertedCount > 0) {
        res.sendStatus(200);
      } else {
        res.sendStatus(400);
      }
    });
  });

  // Endpoint for getting all/conditional posts
  app.post("/getPosts", (req, res) => {
    const email = req.body.email;
    const withImage = req.query.withImage;
    const id = req.body ? req.body.id : null;
    console.log(email);
    let filterObject = {};
    if (withImage === "true") {
      filterObject.status = 1;
      filterObject.email = { $ne: req.body.email };
    }

    if (id) {
      filterObject._id = ObjectId(id);
    }

    const projectObject = {};
    if (withImage === "false") {
      projectObject.image = 0;
    }

    postsCollection
      .find(filterObject)
      .project(projectObject)
      .sort({ createdAt: -1 })
      .toArray((err, posts) => {
        console.log(posts);
        if (posts) {
          res.status(200).send(posts);
        } else {
          res.sendStatus(404);
        }
      });
  });

  app.post("/updatePost", (req, res) => {
    postsCollection
      .updateOne({ _id: ObjectId(req.body.id) }, { $set: { status: 1 } })
      .then((result) => {
        console.log(result);
        if (result.modifiedCount > 0) {
          res.status(200).send(result.modifiedCount > 0);
        } else {
          res.sendStatus(404);
        }
      });
  });

  app.post("/leaveComment", (req, res) => {
    console.log(req.body);
    postsCollection
      .updateOne(
        { _id: ObjectId(req.body.id) },
        {
          $push: { comments: { author: req.body.author, text: req.body.text } },
        }
      )
      .then((result) => console.log(result));
  });

  app.delete("/deletePost/:id", (req, res) => {
    postsCollection
      .deleteOne({ _id: ObjectId(req.params.id) })
      .then((result) => {
        if (result.deletedCount > 0) {
          res.sendStatus(200);
        } else {
          res.sendStatus(404);
        }
      });
  });
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
