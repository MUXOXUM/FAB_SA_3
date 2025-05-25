const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your_jwt_secret'; // Use a strong, unique secret in a real application

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Path to the data file
const dataFilePath = path.join(__dirname, 'data', 'users.json');

// Helper function to read users from the data file
const getUsers = () => {
    if (!fs.existsSync(dataFilePath)) {
        fs.writeFileSync(dataFilePath, JSON.stringify([]));
        return [];
    }
    const jsonData = fs.readFileSync(dataFilePath);
    return JSON.parse(jsonData);
};

// Helper function to save users to the data file
const saveUsers = (users) => {
    fs.writeFileSync(dataFilePath, JSON.stringify(users, null, 2));
};

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}


// Registration route
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    const users = getUsers();

    if (users.find(user => user.email === email)) {
        return res.status(400).json({ message: 'Email already exists' });
    }

    if (users.find(user => user.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: users.length + 1, username, email, password: hashedPassword };
    users.push(newUser);
    saveUsers(users);

    res.status(201).json({ message: 'User registered successfully' });
});

// Login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    const users = getUsers();
    const user = users.find(user => user.email === email);

    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

    res.json({ token });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
