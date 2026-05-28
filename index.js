

const express = require("express");
const mysql = require('mysql2');
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const methodOverride = require("method-override");
let ejs = require('ejs');

// 1. .env  environment variables  (Deployment Step 1)
require('dotenv').config();

const app = express();


// 2. Database Connection Pool (Deployment Step 2 - Using process.env)
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    // Pool settings (optional but good practice)
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 3. Port Configuration (Deployment Step 3)
const port = process.env.PORT || 8080; 


// Middleware Setup
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname,"public"))); 
app.use(methodOverride("_method"));

// EJS Setup
app.set("view engine","ejs");
app.set("views", path.join(__dirname,"/views"));





// Utility function for password check
const checkPassword = (id, userpassword) => {
    return new Promise((resolve, reject) => {
        const q = "SELECT password FROM user WHERE id = ?";
        connection.query(q, [id], (err, result) => {
            if (err) return reject(err);
            if (result.length > 0) {
                // Check if userpassword matches the password from DB
                resolve(userpassword === result[0].password);
            } else {
                resolve(false); // User ID not found
            }
        });
    });
};


// --- Routes ---

app.get("/",(req,res)=>{
    res.redirect("/post");
});

// GET: All Posts (Index)
app.get("/post",(req,res)=>{
    // Use pool.query (pool connection ke liye)
    const q = `SELECT * FROM user`; 
    connection.query(q,(err,result)=>{
        if(err) {
            console.error("Database query error:", err);
            // Handle error gracefully on the frontend
            return res.render("index.ejs", { result: [], error: "Failed to fetch posts." });
        }
        res.render("index.ejs",{result});
    });
});

// GET: New Post Form
app.get("/post/new",(req,res)=>{
    res.render("newpost.ejs");
});

// POST: New Post Creation
app.post("/post/new",(req,res) =>{
    const { username, email, password ,post} = req.body;
    // Note: Production applications should hash/salt passwords before storing them!

    // Insert new user
    const query = "INSERT INTO user (id, username, email, password, post) VALUES (?, ?, ?, ?, ?)";
    const values = [uuidv4(), username, email, password, post];
    connection.query(query, values, (err, result) => {
        if (err) {
            console.error("Insert query error:", err);
            return res.render("newpost.ejs", { error: "Failed to insert user. (Check unique constraints)" });
        }
        res.redirect("/post"); 
    });
});

// GET: Individual Post (Show)
app.get("/post/:id",(req,res)=>{
    let {id} = req.params;
    
    const q =`SELECT * FROM user WHERE id=?`;
    connection.query(q,id,(err,result)=>{
        if(err) {
            console.error("Show query error:", err);
            return res.status(500).send("Error fetching post details.");
        }
        if (result.length === 0) {
            return res.status(404).send("Post not found.");
        }
        res.render("show.ejs",{result});
    });
});

// GET: Check Password (Edit)
app.get("/post/:id/edit",(req,res)=>{
    let {id} = req.params;
    let what ="edit";
    res.render("checkpassword.ejs",{id,what});
});


// POST: Check Password & Render Edit Form
app.post("/post/:id/edit",async(req,res)=>{
    const userpassword = req.body.password;
    let {id} = req.params;
    let right = await checkPassword(id,userpassword);
    
    if(right){
        const q =`SELECT * FROM user where id=? `;
        connection.query(q,id,(err,result)=>{
            if(err) {
                console.error("Edit form query error:", err);
                return res.status(500).send("Error fetching user data for edit.");
            }
            // result is an array, we need the first element
            const user = result[0];
            res.render("edit.ejs",{
                id: user.id,
                username: user.username,
                email: user.email,
                post: user.post,
                password: user.password // Note: In production, never pass password to the view
            });
        });
    }else{
        res.render("checkpassword.ejs", { id, what: "edit",error: "Wrong password" });
    }
});

// PATCH: Update Post
app.patch("/post/:id/edit",(req,res) =>{
    const { id } = req.params;
    let { username, email, password,post } = req.body;

    // Production environment में, आप username/email check को एक Promise या async/await block में nest करेंगे।
    // For simplicity, using nested queries as in your original code, but this is messy:
    
    // 1. Check if username is used by another user
    const checkUsername = "SELECT * FROM user WHERE username = ? AND id != ?";
    connection.query(checkUsername, [username, id], (err, results) => {
        if (err) return res.render("edit.ejs", { id, username, email, password, post, error: "Database error (Username check)" });
        if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, post, error: "Username already in use" });

        // 2. Check if email is used by another user
        const checkEmail = "SELECT * FROM user WHERE email = ? AND id != ?";
        connection.query(checkEmail, [email, id], (err, results) => {
            if (err) return res.render("edit.ejs", { id, username, email, password, post, error: "Database error (Email check)" });
            if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, post, error: "Email already in use" });

            // 3. Update user
            const updateQuery = "UPDATE user SET username = ?, post=?, email = ?, password = ? WHERE id = ?";
            const values = [username,post, email, password, id];
            connection.query(updateQuery, values, (err, result) => {
                if (err) return res.render("edit.ejs", { id, username, email, password, post, error: "Failed to update user" });
                return res.redirect("/post");
            });
        });
    });
});


// GET: Check Password (Delete)
app.get("/post/:id/delete",(req,res)=>{
    let {id} = req.params;
    let what ="delete";
    res.render("checkpassword.ejs",{id,what}); 
});

// DELETE: Post Deletion
app.delete("/post/:id/delete",async(req,res)=>{
    let userpassword = req.body.password;
    let {id} = req.params;
    
    const right = await checkPassword(id,userpassword);
    
    if(right){
        const q =`DELETE FROM user WHERE id= ?`;

        connection.query(q,id,(err,result)=>{
            if(err) {
                console.error("Delete query error:", err);
                return res.render("checkpassword.ejs", { id, what: "delete", error: "Failed to delete post." });
            }
            res.redirect("/post");
        });
    }else{
        res.render("checkpassword.ejs", { id, what: "delete",error: "Wrong password" });
    }
});


// Start Server
app.listen(port,()=>{
    console.log(`Server is ready to run on port ${port}`);
});