// server.js (updated)
import express from 'express';
import router from './routes/index'; // Removed .js extension

const app = express();
const port = process.env.PORT || 5000;
const host = '0.0.0.0';

app.use(express.json());
app.use('/', router);

app.listen(port, host, () => {
  console.log(`Server running on ${host}:${port}`);
});

export default app;
