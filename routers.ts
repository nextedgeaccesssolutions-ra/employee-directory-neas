import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { createHeartbeatJob } from "./_core/heartbeat";
import { invokeLLM } from "./_core/llm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createSubmission,
  getDb,
  listAllNavigation,
  listGlobalSectionRevisions,
  listGlobalSections,
  listMediaAssets,
  listPages,
  listProjects,
  listPublishedPages,
  listPublishedProjects,
  listEmployees,
  listRevisions,
  listSubmissions,
} from "./db";
import { employees, formSubmissions, globalSectionRevisions, globalSections, mediaAssets, navigationItems, pages, recentProjects, revisions } from "../drizzle/schema";
import { storagePut } from "./storage";

const blockSchema = z.object({
  id: z.string(),
  type: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  style: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().nonnegative(),
  visible: z.boolean().default(true),
  responsive: z.record(z.string(), z.unknown()).optional(),
});
const layoutSchema = z.array(blockSchema).max(80);
const seoSchema = z.object({
  title: z.string().max(70),
  description: z.string().max(160),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  canonical: z.string().optional(),
  noIndex: z.boolean().default(false),
});

const requireRoles = (roles: string[], label: string) => protectedProcedure.use(({ ctx, next }) => {
  if (!roles.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: `${label} permission required` });
  return next();
});
const editorProcedure = requireRoles(["editor", "reviewer", "publisher", "admin"], "Editor");
const reviewerProcedure = requireRoles(["reviewer", "publisher", "admin"], "Review");
const publisherProcedure = requireRoles(["publisher", "admin"], "Publishing");
const adminProcedure = requireRoles(["admin"], "Administrator");
const employeeReadProcedure = requireRoles(["admin", "hr", "manager"], "Employee directory");
const employeeWriteProcedure = requireRoles(["admin", "hr"], "Employee management");

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  employeeDirectory: router({
    list: employeeReadProcedure.query(() => listEmployees()),
    create: employeeWriteProcedure.input(z.object({ name: z.string().min(1).max(180), role: z.string().min(1).max(160), email: z.string().email().max(320), driveFolderId: z.string().max(255).default("18LExKPiPAU4zvAEV5cg8v1ELeC1ncCHU") })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db.insert(employees).values({ ...input, createdBy: ctx.user.id, updatedBy: ctx.user.id });
      return { id: Number(result[0].insertId) };
    }),
    update: employeeWriteProcedure.input(z.object({ id: z.number(), name: z.string().min(1).max(180), role: z.string().min(1).max(160), email: z.string().email().max(320), driveFolderId: z.string().max(255) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...data } = input; await db.update(employees).set({ ...data, updatedBy: ctx.user.id }).where(eq(employees.id, id)); return { success: true };
    }),
    remove: employeeWriteProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(employees).where(eq(employees.id, input.id)); return { success: true };
    }),
  }),
  publicSite: router({
    pages: publicProcedure.query(() => listPublishedPages()),
    navigation: publicProcedure.query(() => listAllNavigation().then((items) => items.filter((item) => item.isVisible))),
    globals: publicProcedure.query(() => listGlobalSections().then((items) => items.filter((item) => item.status === "published"))),
    projects: publicProcedure.query(() => listPublishedProjects()),
    submitContact: publicProcedure
      .input(z.object({ formName: z.string().min(1).max(120), payload: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => createSubmission(input.formName, JSON.stringify(input.payload)).then(() => ({ success: true }))),
  }),
  cms: router({
    pages: protectedProcedure.query(() => listPages()),
    revisions: editorProcedure.input(z.object({ pageId: z.number() })).query(({ input }) => listRevisions(input.pageId)),
    submissions: protectedProcedure.query(() => listSubmissions()),
    projects: protectedProcedure.query(() => listProjects()),
    navigation: protectedProcedure.query(() => listAllNavigation()),
    globals: protectedProcedure.query(() => listGlobalSections()),
    globalRevisions: editorProcedure.input(z.object({ globalSectionId: z.number() })).query(({ input }) => listGlobalSectionRevisions(input.globalSectionId)),
    media: protectedProcedure.query(() => listMediaAssets()),

    saveProject: editorProcedure.input(z.object({
      id: z.number().optional(), title: z.string().min(1).max(180), location: z.string().min(1).max(160),
      service: z.string().min(1).max(120), summary: z.string().min(1).max(1200), imageUrl: z.string().optional(),
      displayOrder: z.number().int().nonnegative().default(0),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const data = { title: input.title, location: input.location, service: input.service, summary: input.summary, imageUrl: input.imageUrl || null, displayOrder: input.displayOrder, updatedBy: ctx.user.id };
      if (input.id) { await db.update(recentProjects).set(data).where(eq(recentProjects.id, input.id)); return { id: input.id }; }
      const result = await db.insert(recentProjects).values({ ...data, isPublished: false });
      return { id: Number(result[0].insertId) };
    }),
    setProjectPublished: publisherProcedure.input(z.object({ id: z.number(), isPublished: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.update(recentProjects).set({ isPublished: input.isPublished }).where(eq(recentProjects.id, input.id));
      return { success: true };
    }),

    saveNavigation: publisherProcedure.input(z.object({ id: z.number().optional(), label: z.string().min(1).max(120), href: z.string().min(1).max(255), displayOrder: z.number().int().nonnegative(), isVisible: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const data = { label: input.label, href: input.href, displayOrder: input.displayOrder, isVisible: input.isVisible };
      if (input.id) { await db.update(navigationItems).set(data).where(eq(navigationItems.id, input.id)); return { id: input.id }; }
      const result = await db.insert(navigationItems).values(data); return { id: Number(result[0].insertId) };
    }),
    saveGlobal: publisherProcedure.input(z.object({ id: z.number().optional(), name: z.string().min(1).max(120), content: z.string().min(1).max(5000), status: z.enum(["draft", "published"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const data = { name: input.name, content: input.content, status: input.status, updatedBy: ctx.user.id };
      if (input.id) {
        const current = (await db.select().from(globalSections).where(eq(globalSections.id, input.id)).limit(1))[0];
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Global section not found" });
        await db.update(globalSections).set(data).where(eq(globalSections.id, input.id));
        await db.insert(globalSectionRevisions).values({ globalSectionId: input.id, authorId: ctx.user.id, summary: input.status === "published" ? "Published global section" : "Saved global-section draft", previousContent: current.content, updatedContent: input.content, previousStatus: current.status, updatedStatus: input.status });
        return { id: input.id };
      }
      const result = await db.insert(globalSections).values(data);
      const id = Number(result[0].insertId);
      await db.insert(globalSectionRevisions).values({ globalSectionId: id, authorId: ctx.user.id, summary: input.status === "published" ? "Created and published global section" : "Created global-section draft", previousContent: null, updatedContent: input.content, previousStatus: null, updatedStatus: input.status });
      return { id };
    }),
    rollbackGlobal: publisherProcedure.input(z.object({ globalSectionId: z.number(), revisionId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const current = (await db.select().from(globalSections).where(eq(globalSections.id, input.globalSectionId)).limit(1))[0];
      const revision = (await db.select().from(globalSectionRevisions).where(eq(globalSectionRevisions.id, input.revisionId)).limit(1))[0];
      if (!current || !revision || revision.globalSectionId !== input.globalSectionId) throw new TRPCError({ code: "NOT_FOUND", message: "Global revision not found" });
      await db.update(globalSections).set({ content: revision.updatedContent, status: revision.updatedStatus, updatedBy: ctx.user.id }).where(eq(globalSections.id, input.globalSectionId));
      await db.insert(globalSectionRevisions).values({ globalSectionId: input.globalSectionId, authorId: ctx.user.id, summary: `Rolled back to global revision ${input.revisionId}`, previousContent: current.content, updatedContent: revision.updatedContent, previousStatus: current.status, updatedStatus: revision.updatedStatus });
      return { success: true };
    }),
    updateSubmission: reviewerProcedure.input(z.object({ id: z.number(), status: z.enum(["new", "reviewed", "archived"]) })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.update(formSubmissions).set({ status: input.status }).where(eq(formSubmissions.id, input.id)); return { success: true };
    }),
    uploadMedia: editorProcedure.input(z.object({ filename: z.string().min(1).max(255), mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]), base64: z.string().min(1).max(12_000_000), altText: z.string().max(255).optional() })).mutation(async ({ ctx, input }) => {
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
      const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (bytes.length > 8_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Files must be 8 MB or smaller" });
      const stored = await storagePut(`cms/${ctx.user.id}/${Date.now()}-${safeName}`, bytes, input.mimeType);
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const result = await db.insert(mediaAssets).values({ filename: input.filename, mimeType: input.mimeType, url: stored.url, storageKey: stored.key, altText: input.altText || null, uploadedBy: ctx.user.id });
      return { id: Number(result[0].insertId), url: stored.url };
    }),

    aiDraftService: editorProcedure.input(z.object({ serviceName: z.string().min(2).max(120), audience: z.string().max(240).optional(), notes: z.string().max(1000).optional() })).mutation(async ({ input }) => {
      const response = await invokeLLM({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "Draft concise, factual NEAS service descriptions. Never invent certifications, clients, results, locations, prices, or guarantees. Return JSON only." },
          { role: "user", content: `Service: ${input.serviceName}. Audience: ${input.audience ?? "prospective business clients"}. Verified staff notes: ${input.notes ?? "none"}. Write a 45-70 word description, one benefit line, and three capability tags.` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "service_draft", strict: true, schema: { type: "object", properties: { description: { type: "string" }, benefit: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["description", "benefit", "tags"], additionalProperties: false } } },
      });
      const content = response.choices[0]?.message?.content;
      if (typeof content !== "string") throw new Error("AI draft unavailable");
      return JSON.parse(content) as { description: string; benefit: string; tags: string[] };
    }),

    saveDraft: editorProcedure.input(z.object({ id: z.number().optional(), title: z.string().min(1).max(255), slug: z.string().regex(/^[a-z0-9-]+$/), layout: layoutSchema, seo: seoSchema, summary: z.string().min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const data = { title: input.title, slug: input.slug, layout: JSON.stringify(input.layout), seo: JSON.stringify(input.seo), status: "draft" as const, updatedBy: ctx.user.id };
      if (input.id) {
        const current = (await db.select().from(pages).where(eq(pages.id, input.id)).limit(1))[0];
        await db.update(pages).set(data).where(eq(pages.id, input.id));
        await db.insert(revisions).values({ pageId: input.id, authorId: ctx.user.id, summary: input.summary, previousContent: current?.layout ?? null, updatedContent: data.layout, status: "draft" });
        return { id: input.id };
      }
      const result = await db.insert(pages).values(data); return { id: Number(result[0].insertId) };
    }),
    duplicatePage: editorProcedure.input(z.object({ pageId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const source = (await db.select().from(pages).where(eq(pages.id, input.pageId)).limit(1))[0];
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      const result = await db.insert(pages).values({ title: `${source.title} Copy`, slug: `${source.slug}-copy-${Date.now().toString().slice(-5)}`, layout: source.layout, seo: source.seo, featuredImageUrl: source.featuredImageUrl, status: "draft", updatedBy: ctx.user.id });
      return { id: Number(result[0].insertId) };
    }),
    submitForReview: editorProcedure.input(z.object({ pageId: z.number(), comment: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.update(pages).set({ status: "pending_review" }).where(eq(pages.id, input.pageId));
      const page = (await db.select().from(pages).where(eq(pages.id, input.pageId)).limit(1))[0];
      if (page) await db.insert(revisions).values({ pageId: input.pageId, authorId: ctx.user.id, summary: "Submitted for review", previousContent: page.layout, updatedContent: page.layout, status: "pending_review", reviewComment: input.comment });
      return { success: true };
    }),
    approve: reviewerProcedure.input(z.object({ pageId: z.number(), comment: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.update(pages).set({ status: "approved" }).where(eq(pages.id, input.pageId));
      const page = (await db.select().from(pages).where(eq(pages.id, input.pageId)).limit(1))[0];
      if (page) await db.insert(revisions).values({ pageId: input.pageId, authorId: ctx.user.id, summary: "Approved", previousContent: page.layout, updatedContent: page.layout, status: "approved", reviewComment: input.comment });
      return { success: true };
    }),
    publish: publisherProcedure.input(z.object({ pageId: z.number(), scheduledAt: z.date().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const page = (await db.select().from(pages).where(eq(pages.id, input.pageId)).limit(1))[0];
      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      if (input.scheduledAt) {
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const job = await createHeartbeatJob({ name: `publish-page-${input.pageId}`, cron: `0 ${input.scheduledAt.getUTCMinutes()} ${input.scheduledAt.getUTCHours()} ${input.scheduledAt.getUTCDate()} ${input.scheduledAt.getUTCMonth() + 1} *`, path: "/api/scheduled/publish-page", description: `Publish NEAS page ${input.pageId}` }, sessionToken);
        await db.update(pages).set({ status: "scheduled", scheduledAt: input.scheduledAt, scheduleCronTaskUid: job.taskUid, publishedAt: null }).where(eq(pages.id, input.pageId));
        await db.insert(revisions).values({ pageId: input.pageId, authorId: ctx.user.id, summary: `Scheduled for ${input.scheduledAt.toISOString()}`, previousContent: page.layout, updatedContent: page.layout, status: "scheduled" });
      } else {
        await db.update(pages).set({ status: "published", scheduledAt: null, publishedAt: new Date() }).where(eq(pages.id, input.pageId));
        await db.insert(revisions).values({ pageId: input.pageId, authorId: ctx.user.id, summary: "Published", previousContent: page.layout, updatedContent: page.layout, status: "published" });
      }
      return { success: true };
    }),
    unpublish: publisherProcedure.input(z.object({ pageId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const page = (await db.select().from(pages).where(eq(pages.id, input.pageId)).limit(1))[0];
      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      await db.update(pages).set({ status: "archived", publishedAt: null, scheduledAt: null }).where(eq(pages.id, input.pageId));
      await db.insert(revisions).values({ pageId: input.pageId, authorId: ctx.user.id, summary: "Unpublished and archived", previousContent: page.layout, updatedContent: page.layout, status: "archived" });
      return { success: true };
    }),
    rollback: publisherProcedure.input(z.object({ pageId: z.number(), revisionId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const revision = (await db.select().from(revisions).where(eq(revisions.id, input.revisionId)).limit(1))[0];
      if (!revision || revision.pageId !== input.pageId) throw new TRPCError({ code: "NOT_FOUND", message: "Revision not found" });
      const page = (await db.select().from(pages).where(eq(pages.id, input.pageId)).limit(1))[0];
      await db.update(pages).set({ layout: revision.updatedContent, status: "draft" }).where(eq(pages.id, input.pageId));
      await db.insert(revisions).values({ pageId: input.pageId, authorId: ctx.user.id, summary: `Rolled back to revision ${input.revisionId}`, previousContent: page?.layout ?? null, updatedContent: revision.updatedContent, status: "draft" });
      return { success: true };
    }),
    deleteNavigation: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.delete(navigationItems).where(eq(navigationItems.id, input.id)); return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
