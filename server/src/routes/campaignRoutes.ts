import { Router, Request, Response } from 'express';
import * as campaignService from '../services/campaignService';
import { senderService } from '../services/senderService';

type IdParams = { id: string };

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const campaigns = await campaignService.getAllCampaigns();
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, session_id, list_id, message_template, delay_min_ms, delay_max_ms, contact_limit } = req.body;
    if (!name || !session_id || !list_id || !message_template) {
      return res.status(400).json({ error: 'name, session_id, list_id, and message_template are required' });
    }
    const campaign = await campaignService.createCampaign({
      name, session_id, list_id, message_template, delay_min_ms, delay_max_ms, contact_limit,
    });
    res.status(201).json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const campaign = await campaignService.getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/start', async (req: Request<IdParams>, res: Response) => {
  try {
    senderService.startCampaign(req.params.id).catch(err => {
      console.error(`Campaign ${req.params.id} error:`, err);
    });
    res.json({ message: 'Campaign started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/pause', async (req: Request<IdParams>, res: Response) => {
  try {
    senderService.pauseCampaign(req.params.id);
    res.json({ message: 'Campaign pausing...' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/logs', async (req: Request<IdParams>, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await campaignService.getCampaignLogs(req.params.id, page, limit);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    await campaignService.deleteCampaign(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
