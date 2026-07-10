import 'dotenv/config';
import { app } from './app.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`);
});
