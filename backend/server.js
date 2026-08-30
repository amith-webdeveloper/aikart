const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("AIKart backend is running");
});

app.listen(3000, () => {
  console.log("AIKart backend running on port 3000");
});