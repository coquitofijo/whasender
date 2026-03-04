import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import * as contactListService from '../services/contactListService';

type IdParams = { id: string };

const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const lists = await contactListService.getAllContactLists();
    res.json(lists);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const list = await contactListService.createContactListFromCSV(name, req.file.path);
    res.status(201).json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const list = await contactListService.getContactListById(req.params.id);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/contacts', async (req: Request<IdParams>, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await contactListService.getContacts(req.params.id, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    await contactListService.deleteContactList(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
