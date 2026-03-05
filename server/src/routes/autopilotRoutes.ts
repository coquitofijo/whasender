import { Router, Request, Response } from 'express';
import { autopilotService } from '../services/autopilotService';
import pool from '../db/pool';

const router = Router();

// Get recent autopilot logs (persisted)
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await autopilotService.getLogs(limit);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get autopilot config + assignments
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await autopilotService.getConfig();
    const assignments = await autopilotService.getAssignments();
    res.json({ config, assignments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update autopilot config
router.put('/config', async (req: Request, res: Response) => {
  try {
    const config = await autopilotService.updateConfig(req.body);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set a session-to-list assignment
router.post('/assignments', async (req: Request, res: Response) => {
  try {
    const { session_id, list_id } = req.body;
    if (!session_id || !list_id) {
      return res.status(400).json({ error: 'session_id and list_id are required' });
    }

    // Validate session is connected
    const { rows } = await pool.query('SELECT status FROM sessions WHERE id = $1', [session_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Sesion no encontrada' });
    if (rows[0].status !== 'connected') {
      return res.status(400).json({ error: `No se puede asignar una sesion con estado "${rows[0].status}". Solo sesiones conectadas.` });
    }

    await autopilotService.setAssignment(session_id, list_id);
    const assignments = await autopilotService.getAssignments();
    res.json(assignments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Remove assignment
router.delete('/assignments/:sessionId', async (req: Request<{ sessionId: string }>, res: Response) => {
  try {
    await autopilotService.removeAssignment(req.params.sessionId);
    const assignments = await autopilotService.getAssignments();
    res.json(assignments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start autopilot
router.post('/start', async (_req: Request, res: Response) => {
  try {
    await autopilotService.start();
    res.json({ message: 'Autopilot started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stop autopilot
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    await autopilotService.stop();
    res.json({ message: 'Autopilot stopped' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
