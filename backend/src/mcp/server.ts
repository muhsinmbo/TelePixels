#!/usr/bin/env tsx
/**
 * TelePixels MCP server (stdio).
 * Exposes the 3 controlled clinical tools — the same functions behind /api/ai/*.
 * Trust model: runs next to the backend and talks to Postgres directly;
 * every call takes an explicit facilityId (audit-logged as mcp-service).
 * Production use binds this to the clinician's session; for the hackathon the
 * client host (your IDE/agent) is the trust boundary, per MCP convention.
 *
 * Add to your MCP client config:
 *   { "mcpServers": { "telepixels": {
 *       "command": "npx", "args": ["tsx", "src/mcp/server.ts"], "cwd": "<repo>/backend" } } }
 * Or run: npm run mcp
 */
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getStudyContext, getReportingTemplate, getPreviousReports } from '../ai/tools.js';
import { dbQuery } from '../database/db.js';

async function auditMCP(tool: string, details: string, facilityId: string | null) {
  try {
    await dbQuery(
      `INSERT INTO system_logs (action, details, user_id, user_name, user_role, facility_id)
       VALUES ($1,$2,'mcp-service','MCP service','system',$3)`,
      [`MCP_${tool}`, details, facilityId]
    );
  } catch (e: any) {
    console.error('[mcp] audit failed:', e.message);
  }
}

const server = new McpServer({ name: 'telepixels', version: '1.0.0' });

server.tool(
  'get_study_context',
  'Primary clinical context for the study the clinician is currently reporting. Returns age, sex, modality, examination, body part, and clinical history. Use this FIRST before drafting anything.',
  {
    patientId: z.string().describe('TelePixels patient ID (e.g. KP-DEMO01)'),
    requestId: z.string().describe('TelePixels imaging request ID (e.g. req_demo_pelvic)'),
    facilityId: z.string().describe('Calling facility ID for scoping (e.g. default-facility)'),
  },
  async ({ patientId, requestId, facilityId }) => {
    const ctx = await getStudyContext(patientId, requestId, facilityId || null);
    await auditMCP('CONTEXT', `context for ${requestId}`, facilityId || null);
    if (!ctx) return { content: [{ type: 'text' as const, text: 'Study not found or access denied.' }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(ctx, null, 2) }] };
  }
);

server.tool(
  'get_reporting_template',
  'Correct report structure for a modality + examination + sex. NEVER produce a report type the template does not describe (e.g. never a prostate template for a female pelvic study).',
  {
    modality: z.string().describe('e.g. Ultrasound, X-Ray'),
    examination: z.string().describe('e.g. Pelvic Ultrasound, Chest (Thorax)'),
    sex: z.string().optional().describe('Female, Male, Other, or omit'),
  },
  async ({ modality, examination, sex }) => {
    const tpl = await getReportingTemplate(modality, examination, sex || null);
    if (!tpl) return { content: [{ type: 'text' as const, text: 'No template available.' }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(tpl, null, 2) }] };
  }
);

server.tool(
  'get_relevant_previous_reports',
  'Supporting history for a patient: finalized reports from OTHER studies. Secondary context only — never changes the current report type.',
  {
    patientId: z.string().describe('TelePixels patient ID'),
    excludeRequestId: z.string().describe('Current request ID to exclude'),
    facilityId: z.string().describe('Calling facility ID for scoping'),
    limit: z.number().min(1).max(10).default(5).describe('Max reports to return'),
  },
  async ({ patientId, excludeRequestId, facilityId, limit }) => {
    const rows = await getPreviousReports(patientId, excludeRequestId, facilityId || null, limit);
    await auditMCP('PREVIOUS', `history for ${patientId}`, facilityId || null);
    if (!rows) return { content: [{ type: 'text' as const, text: 'Patient not found or access denied.' }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] telepixels tools live: get_study_context, get_reporting_template, get_relevant_previous_reports');
}

main().catch((err) => {
  console.error('[mcp] fatal:', err.message);
  process.exit(1);
});
