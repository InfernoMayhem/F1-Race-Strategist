const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// define path to frontend static files
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

// test API button functionality
app.get("/api/hello", (_req, res) => {
	res.json({ message: "Backend is working!" });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
