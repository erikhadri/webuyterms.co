const express = require('express');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const net = require('net');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // Serve root directory
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Explicit routes for HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/sell.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'sell.html'));
});
app.get('/contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact.html'));
});
app.get('/about.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'about.html'));
});
app.get('/how-it-works.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'how-it-works.html'));
});

// MongoDB Connection with Reconnect
async function connectMongoDB(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      });
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('MongoDB connection failed after retries');
  process.exit(1);
}

// MongoDB Schema
const submissionSchema = new mongoose.Schema({
  form_type: String,
  data: Object,
  createdAt: { type: Date, default: Date.now },
});
const Submission = mongoose.model('Submission', submissionSchema);

// Email Transporter with Retry
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  pool: true,
  maxConnections: 5,
  rateLimit: 10,
});

transporter.verify((error, success) => {
  if (error) {
    console.error('Email transporter error:', error);
  } else {
    console.log('Email transporter ready');
  }
});

// Helper Function to Send Email with Retry
const sendEmail = async (formData, formType, isSuccessNotification = false, userEmail = null, retries = 3) => {
  let htmlContent;
  let subject;
  let to;

  if (isSuccessNotification) {
    subject = `Submission Confirmation - ${formType}`;
    htmlContent = `
      <h2>Thank You for Your Submission!</h2>
      <p>Your ${formType} submission has been received successfully.</p>
      <p><strong>Details:</strong></p>
      ${Object.entries(formData)
        .map(([key, value]) => `<p><strong>${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:</strong> ${value}</p>`)
        .join('')}
      <p>We will review your information and get back to you within 24 hours.</p>
      <p>Best regards,<br>Buy Vegas Houses Team</p>
    `;
    to = userEmail ? `${userEmail},${process.env.TO_EMAIL}` : process.env.TO_EMAIL;
  } else {
    subject = `New ${formType} Submission`;
    htmlContent = `<h2>${formType} Submission</h2>`;
    for (const [key, value] of Object.entries(formData)) {
      htmlContent += `<p><strong>${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:</strong> ${value}</p>`;
    }
    to = process.env.TO_EMAIL;
  }

  const mailOptions = {
    from: `"Buy Vegas Houses" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent:', info.response);
      return;
    } catch (error) {
      console.error(`Email attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
};

// Unified API Route for All Forms
app.post('/api/submit', async (req, res) => {
  console.log('Received /api/submit request:', req.body);
  const formData = req.body;
  const formType = formData.form_type || 'Unknown Form';

  if (!formData || Object.keys(formData).length === 0) {
    console.error('Error: Form data is empty');
    return res.status(400).json({ success: false, message: 'Form data is required.' });
  }

  try {
    const submission = new Submission({
      form_type: formType,
      data: formData,
    });
    await submission.save();
    console.log('Form data saved to MongoDB:', formType);

    await sendEmail(formData, formType);
    const userEmail = formData.seller_email || formData.Email || null;
    if (userEmail) {
      await sendEmail(formData, formType, true, userEmail);
    }

    res.status(200).json({ success: true, message: 'Form submitted successfully.' });
  } catch (error) {
    console.error('Error processing form:', error);
    res.status(500).json({ success: false, message: `Error processing form: ${error.message}` });
  }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// 404 Handler
app.use((req, res) => {
  console.error('404 - Route not found:', req.url);
  res.status(404).send('Page not found');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Handle Uncaught Exceptions and Rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Port Checking and Server Start
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await checkPort(PORT);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error(err.message);
    console.log('Retrying server start in 5 seconds...');
    setTimeout(startServer, 5000);
  }
}

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`Port ${port} in use`));
    });
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(port);
  });
}

// Start MongoDB and Server
async function initialize() {
  await connectMongoDB();
  await startServer();
}

initialize();