// 1. .env variables ALWAYS come first (Top-most priority)
require('dotenv').config();

const express = require("express");
const mysql = require('mysql2');
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const methodOverride = require("method-override");
let ejs = require('ejs');

const app = express();

// 2. Database Connection Pool Setup using Environment Variables
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    // Safely parse port to integer or fallback to default MySQL port 3306
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Production ready timeout settings to prevent app hanging
    connectTimeout: 10000 
});

// Test Database Connection on startup to log errors clearly in Render logs
connection.getConnection((err, conn) => {
    if (err) {
        console.error("❌ Database Connection Failed:", err.message);
    } else {
        console.log("✅ Database Connected Successfully via Connection Pool!");
        conn.release(); // release immediately back to pool
    }
});

// 3. Port Configuration (Render automatically assigns dynamic ports via process.env.PORT)
const port = process.env.PORT || 8080; 

// Middleware Setup
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, "public"))); 
app.use(methodOverride("_method"));

// EJS Layout Setup using explicit path definitions
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Utility function for password check
const checkPassword = (id, userpassword) => {
    return new Promise((resolve, reject) => {
        const q = "SELECT password FROM user WHERE id = ?";
        connection.query(q, [id], (err, result) => {
            if (err) return reject(err);
            if (result && result.length > 0) {
                resolve(userpassword === result[0].password);
            } else {
                resolve(false); 
            }
        });
    });
};

// --- Routes ---

app.get("/", (req, res) => {
    res.redirect("/post");
});

// GET: All Posts (Index)
app.get("/post", (req, res) => {
    const q = `SELECT * FROM user`; 
    connection.query(q, (err, result) => {
        if (err) {
            console.error("Database query error:", err);
            return res.render("index.ejs", { result: [], error: "Failed to fetch posts." });
        }
        res.render("index.ejs", { result });
    });
});

// GET: New Post Form
app.get("/post/new", (req, res) => {
    res.render("newpost.ejs");
});

// POST: New Post Creation
app.post("/post/new", (req, res) => {
    const { username, email, password, post } = req.body;

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
app.get("/post/:id", (req, res) => {
    let { id } = req.params;
    
    const q = `SELECT * FROM user WHERE id=?`;
    connection.query(q, [id], (err, result) => { // Fixed safety: id array structure passed explicitly
        if (err) {
            console.error("Show query error:", err);
            return res.status(500).send("Error fetching post details.");
        }
        if (!result || result.length === 0) {
            return res.status(404).send("Post not found.");
        }
        res.render("show.ejs", { result });
    });
});

// GET: Check Password (Edit)
app.get("/post/:id/edit", (req, res) => {
    let { id } = req.params;
    let what = "edit";
    res.render("checkpassword.ejs", { id, what });
});

// POST: Check Password & Render Edit Form
app.post("/post/:id/edit", async (req, res) => {
    const userpassword = req.body.password;
    let { id } = req.params;
    
    try {
        let right = await checkPassword(id, userpassword);
        if (right) {
            const q = `SELECT * FROM user where id=? `;
            connection.query(q, [id], (err, result) => {
                if (err) {
                    console.error("Edit form query error:", err);
                    return res.status(500).send("Error fetching user data for edit.");
                }
                const user = result[0];
                res.render("edit.ejs", {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    post: user.post,
                    password: user.password 
                });
            });
        } else {
            res.render("checkpassword.ejs", { id, what: "edit", error: "Wrong password" });
        }
    } catch (error) {
        console.error("Password verification crash:", error);
        res.status(500).send("Internal Server Error processing password verification.");
    }
});

// PATCH: Update Post
app.patch("/post/:id/edit", (req, res) => {
    const { id } = req.params;
    let { username, email, password, post } = req.body;
    
    const checkUsername = "SELECT * FROM user WHERE username = ? AND id != ?";
    connection.query(checkUsername, [username, id], (err, results) => {
        if (err) return res.render("edit.ejs", { id, username, email, password, post, error: "Database error (Username check)" });
        if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, post, error: "Username already in use" });

        const checkEmail = "SELECT * FROM user WHERE email = ? AND id != ?";
        connection.query(checkEmail, [email, id], (err, results) => {
            if (err) return res.render("edit.ejs", { id, username, email, password, post, error: "Database error (Email check)" });
            if (results.length > 0) return res.render("edit.ejs", { id, username, email, password, post, error: "Email already in use" });

            const updateQuery = "UPDATE user SET username = ?, post=?, email = ?, password = ? WHERE id = ?";
            const values = [username, post, email, password, id];
            connection.query(updateQuery, values, (err, result) => {
                if (err) return res.render("edit.ejs", { id, username, email, password, post, error: "Failed to update user" });
                return res.redirect("/post");
            });
        });
    });
});

// GET: Check Password (Delete)
app.get("/post/:id/delete", (req, res) => {
    let { id } = req.params;
    let what = "delete";
    res.render("checkpassword.ejs", { id, what }); 
});

// DELETE: Post Deletion
app.delete("/post/:id/delete", async (req, res) => {
    let userpassword = req.body.password;
    let { id } = req.params;
    
    try {
        const right = await checkPassword(id, userpassword);
        if (right) {
            const q = `DELETE FROM user WHERE id= ?`;
            connection.query(q, [id], (err, result) => {
                if (err) {
                    console.error("Delete query error:", err);
                    return res.render("checkpassword.ejs", { id, what: "delete", error: "Failed to delete post." });
                }
                res.redirect("/post");
            });
        } else {
            res.render("checkpassword.ejs", { id, what: "delete", error: "Wrong password" });
        }
    } catch (error) {
        console.error("Deletion operational crash:", error);
        res.status(500).send("Internal error executing deletion request.");
    }
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server is scaling and running on port ${port}`);
});