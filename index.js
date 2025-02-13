const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

mongoose.connect(process.env.DATABASE_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const quizSchema = new mongoose.Schema({
  userName: String,
  userEmail: String,
  userSurname: String,
  answers: Array,
  totalPoints: Number,
  pdfUrl: String,
  flipbookUrl: String, // Add flipbookUrl field to schema
});

const Quiz = mongoose.model('Quiz', quizSchema);

const questionsData = require('./qustions.json'); // Import questions data

// Function to generate PDF content using pdf-lib
const generatePdfContent = async (userData, groupedAnswers) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let page = pdfDoc.addPage([600, 800]);
  const { width, height } = page.getSize();
  const fontSize = 12;
  const headerFontSize = 18;
  const titleFontSize = 24;
  const lineSpacing = 16;
  const margin = 20;
  let yPosition = height - margin;

  const addPage = () => {
    const newPage = pdfDoc.addPage([600, 800]);
    yPosition = height - margin;
    return newPage;
  };

  const drawText = (text, options) => {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + word + ' ';
      const textWidth = font.widthOfTextAtSize(testLine, options.size);
      if (textWidth > width - 2 * margin) {
        page.drawText(line, options);
        line = word + ' ';
        options.y -= lineSpacing;
        if (options.y < margin) {
          page = addPage();
          options.y = yPosition;
        }
      } else {
        line = testLine;
      }
    }
    page.drawText(line, options);
  };

  // Add header
  
  yPosition -= lineSpacing * 3;
  const headerText = 'YOUNGERS';
  drawText(headerText, {
    x: width / 2 - (headerText.length * titleFontSize) / 4,
    y: yPosition,
    size: titleFontSize,
    color: rgb(0.82, 0.75, 0.31), // Updated RGB values
  });
  yPosition -= lineSpacing * 2;
  // User information
  drawText(`Name: ${userData.userName}`, { x: margin + 10, y: yPosition, size: fontSize });
  drawText(`Surname: ${userData.userSurname}`, { x: margin + 10, y: yPosition - lineSpacing, size: fontSize });
  drawText(`Email: ${userData.userEmail}`, { x: margin + 10, y: yPosition - lineSpacing * 2, size: fontSize });
  drawText(`Total Points: ${userData.totalPoints}`, { x: margin + 10, y: yPosition - lineSpacing * 3, size: fontSize });
  yPosition -= lineSpacing * 5;

  // Grouped answers
  for (const chapterName of Object.keys(groupedAnswers)) {
    // Add background color for headers
    page.drawRectangle({
      x: margin + 5,
      y: yPosition - lineSpacing / 2,
      width: width - 2 * margin - 10,
      height: lineSpacing * 1.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    drawText(chapterName, {
      x: margin + 10,
      y: yPosition,
      size: headerFontSize,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineSpacing * 1.5;

// Draw border (horizontal line)
page.drawRectangle({
  x: margin,
  y: yPosition,
  width: width - 2 * margin,
  height: 1, // Small height to create a line effect
  color: rgb(0, 0, 0),
});
yPosition -= lineSpacing + 4; 

 // Add table headers
drawText('Question', { x: margin, y: yPosition, size: fontSize, color: rgb(0, 0, 0) });
drawText('Answer', { x: margin + 0.6 * (width - 2 * margin), y: yPosition, size: fontSize, color: rgb(0, 0, 0) });
drawText('Points', { x: margin + 0.9 * (width - 2 * margin), y: yPosition, size: fontSize, color: rgb(0, 0, 0) });

yPosition -= lineSpacing;

// Draw border (horizontal line)
page.drawRectangle({
  x: margin,
  y: yPosition,
  width: width - 2 * margin,
  height: 1, // Small height to create a line effect
  color: rgb(0, 0, 0),
});

yPosition -= lineSpacing +4; // Move down for next row


    for (const answer of groupedAnswers[chapterName]) {
      const question = questionsData.find(q => q.questionText === answer.questionName);

      // Add follow-up and improvement suggestions above the question
      if (question.followUp) {
        drawText(`Follow-up`, {
          x: margin + 10,
          y: yPosition,
          size: fontSize,
          color: rgb(0.82, 0.75, 0.31), // #d2be4e color
        });
        yPosition -= lineSpacing;
        if (yPosition < margin) {
          page = addPage();
        }
      }

      // Wrap questionName if it is within 20px distance from answer
      const questionTextWidth = font.widthOfTextAtSize(answer.questionName, fontSize);
      const answerXPosition = margin + 0.6 * (width - 2 * margin);
      if (questionTextWidth > answerXPosition - margin - 20) {
        const wrappedQuestion = answer.questionName.split(' ').reduce((acc, word) => {
          const testLine = acc.line + word + ' ';
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);
          if (testWidth > answerXPosition - margin - 20) {
            acc.lines.push(acc.line);
            acc.line = word + ' ';
          } else {
            acc.line = testLine;
          }
          return acc;
        }, { lines: [], line: '' });
        wrappedQuestion.lines.push(wrappedQuestion.line);

        for (const line of wrappedQuestion.lines) {
          drawText(line, { x: margin, y: yPosition, size: fontSize, color: rgb(0, 0, 0) });
          yPosition -= lineSpacing;
          if (yPosition < margin) {
            page = addPage();
          }
        }
      } else {
        drawText(answer.questionName, { x: margin, y: yPosition, size: fontSize, color: rgb(0, 0, 0) });
      }

      drawText(answer.selectedAnswer, { x: answerXPosition, y: yPosition, size: fontSize, color: rgb(0, 0, 0) });
      drawText(answer.points.toString(), { x: margin + 0.9 * (width - 2 * margin), y: yPosition, size: fontSize, color: rgb(0, 0, 0) });
      yPosition -= lineSpacing;
      if (yPosition < margin) {
        page = addPage();
      }
    }
    yPosition -= lineSpacing;
  }
  // Tier descriptions
  drawText('Tier Descriptions:', {
    x: margin + 10,
    y: yPosition,
    size: headerFontSize,
    color: rgb(0, 0, 0),
  });
  yPosition -= lineSpacing * 1.5;

  const tierDescriptions = [
    {
      title: 'Foundational Seeker:',
      description: 'Clients in this tier are at the beginning of their wellness journey, requiring foundational support and habit-building strategies.',
    },
    {
      title: 'Bespoke Explorer:',
      description: 'These clients have moderate wellness experience and benefit from balanced, customized solutions that blend structure and flexibility.',
    },
    {
      title: 'Elite Innovator:',
      description: 'Advanced clients with high engagement who thrive on cutting-edge, luxury-driven, and hyper-personalized wellness plans.',
    },
  ];

  for (const tier of tierDescriptions) {
    drawText(tier.title, {
      x: margin + 10,
      y: yPosition,
      size: fontSize,
      color: rgb(0.82, 0.75, 0.31),
    });
    yPosition -= lineSpacing;
    drawText(tier.description, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineSpacing * 2;
    if (yPosition < margin) {
      page = addPage();
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
};

// Function to send email with PDF attachment
const sendEmailWithPdf = (userEmail, userName, pdfFileName, pdfUrl) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: 'Your Quiz Results',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <p>Dear ${userName},</p>
        <p>Thank you for completing the quiz. Please find attached your quiz results.</p>
        <p>Best regards,<br/>Quiz Team</p>
        <footer style="margin-top: 20px; font-size: 12px; color: #777;">
          <p>This is an automated message, please do not reply.</p>
        </footer>
      </div>
    `,
    attachments: [
      {
        filename: pdfFileName,
        path: pdfUrl
      }
    ]
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    console.log('Email sent: ' + info.response);
  });
};

// Endpoint to submit quiz data
app.post('/api/submitUserData', async (req, res) => {
  try {
    const { userName, userEmail, userSurname, answers, totalPoints } = req.body;

    if (!userName || !userEmail || !userSurname || !answers || !totalPoints) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const quizData = new Quiz(req.body);

    // Group answers by chapter name
    const groupedAnswers = answers.reduce((acc, answer) => {
      const question = questionsData.find(q => q.questionText === answer.questionName);
      if (!question) {
        throw new Error(`Question not found: ${answer.questionName}`);
      }
      const chapterName = question.chName;
      if (!acc[chapterName]) {
        acc[chapterName] = [];
      }
      acc[chapterName].push(answer);
      return acc;
    }, {});

    // Generate PDF content
    const pdfBytes = await generatePdfContent(req.body, groupedAnswers);
    const randomValue = Math.floor(1000 + Math.random() * 9000);
    const pdfFileName = `${userName}_${userSurname}_${randomValue}.pdf`;

    // Upload PDF to Cloudinary
    cloudinary.uploader.upload_stream({ resource_type: "raw", public_id: pdfFileName }, async (error, result) => {
      if (error) {
        console.error("Cloudinary upload error:", error);
        return res.status(500).json({ message: 'Failed to upload PDF' });
      }

      // Save Cloudinary URL in the database
      quizData.pdfUrl = result.secure_url;
      await quizData.save();

      
      // Send email with PDF attachment
          // Generate Flipbook URL using Heyzine
          const CLIENT_ID = "d7b379a0c18dd0a7";
          const encodedPdfUrl = encodeURIComponent(result.secure_url);
          const flipbookUrl = `https://heyzine.com/api1?pdf=${encodedPdfUrl}&k=${CLIENT_ID}&t=${encodeURIComponent(userName)}&s=Quiz%20Results&d=1&fs=1&sh=1&pn=1&st=1`;
    
          // Save Flipbook URL in the database
          console.log("Flipbook URL:", flipbookUrl);
          quizData.flipbookUrl = flipbookUrl;
          await quizData.save();

      // Send email with PDF attachment
      sendEmailWithPdf(userEmail, userName, pdfFileName, result.secure_url);

      res.status(200).json({
        message: 'Quiz submitted successfully!',
        data: {
          ...quizData.toObject(),
          pdfUrl: result.secure_url,
          flipbookUrl,        }
      });
    }).end(pdfBytes);
  } catch (error) {
    console.error("Error submitting data:", error);
    res.status(500).json({ message: 'Failed to submit quiz.' });
  }
});

app.get('/api/getAllSubmissions', async (req, res) => {
  try {
    const submissions = await Quiz.find();
    res.status(200).json(submissions);
  } catch (error) {
    console.error("Error retrieving submissions:", error);
    res.status(500).send('Failed to retrieve submissions.');
  }
});
app.get('/json/get', function (req, res) {
  const questionsData = require('./qustions.json');
  res.json(questionsData);
});
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
