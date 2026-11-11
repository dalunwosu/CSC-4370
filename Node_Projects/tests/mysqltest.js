const express = require("express"); //imports the express module
const app = express(); //creates the express application object
app.use(express.static("public"));//register public as the directory for static files

const mysql = require("mysql2"); //uses new mysql package
const conn = mysql.createConnection(
{host:"localhost",user:"root",password:"modaza1966",database:"smartshop",port:3309});

conn.connect(function(err)
{
	if(err)
		console.log("Couldnt connect to MySQL",err);
	else
		console.log("Database connection established");
	
});
app.listen(3000);