import { Router, Request, Response } from 'express';
import * as sessionService from '../services/sessionService';
import { SessionManager } from '../whatsapp/SessionManager';

type IdParams = { id: string };

export function createSessionRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const sessions = await sessionService.getAllSessions();
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, proxy_url } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const session = await sessionService.createSession(name, proxy_url);
      res.status(201).json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id/proxy', async (req: Request<IdParams>, res: Response) => {
    try {
      const { proxy_url } = req.body;
      const session = await sessionService.updateProxy(req.params.id, proxy_url || null);
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', async (req: Request<IdParams>, res: Response) => {
    try {
      const session = await sessionService.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/connect', async (req: Request<IdParams>, res: Response) => {
    try {
      const session = await sessionService.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      sessionManager.connectSession(req.params.id).catch(console.error);
      res.json({ message: 'Connecting... Watch for QR code via WebSocket' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/disconnect', async (req: Request<IdParams>, res: Response) => {
    try {
      await sessionManager.disconnectSession(req.params.id);
      res.json({ message: 'Disconnected' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Unrestrict a session (remove restriction flag, reconnect)
  router.post('/:id/unrestrict', async (req: Request<IdParams>, res: Response) => {
    try {
      const session = await sessionService.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'restricted') return res.status(400).json({ error: 'Session is not restricted' });

      // Set back to connected if socket exists, otherwise reconnect
      if (sessionManager.isConnected(req.params.id)) {
        await sessionService.updateStatus(req.params.id, 'connected');
        res.json({ message: 'Session unrestricted and active' });
      } else {
        await sessionService.updateStatus(req.params.id, 'disconnected');
        sessionManager.connectSession(req.params.id).catch(console.error);
        res.json({ message: 'Session unrestricted, reconnecting...' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
    try {
      await sessionManager.disconnectSession(req.params.id);
      await sessionService.deleteSession(req.params.id);
      res.json({ message: 'Deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
