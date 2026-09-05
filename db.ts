import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "./_core/env";
import { InsertUser, users, employees, pages, revisions, formSubmissions, navigationItems, globalSections, globalSectionRevisions, recentProjects, mediaAssets } from "../drizzle/schema";
let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() { if (!_db && process.env.DATABASE_URL) { try { _db = drizzle(process.env.DATABASE_URL); } catch (e) { console.warn("[Database] Failed to connect", e); } } return _db; }
export async function upsertUser(user: InsertUser): Promise<void> { if (!user.openId) throw new Error("User openId is required"); const db=await getDb(); if(!db) return; const values: InsertUser={openId:user.openId}; const updateSet:Record<string,unknown>={}; for(const f of ["name","email","loginMethod"] as const){if(user[f]!==undefined){values[f]=user[f]??null;updateSet[f]=user[f]??null;}} if(user.lastSignedIn){values.lastSignedIn=user.lastSignedIn;updateSet.lastSignedIn=user.lastSignedIn;} if(user.role){values.role=user.role;updateSet.role=user.role;} else if(user.openId===ENV.ownerOpenId){values.role="admin";updateSet.role="admin";} if(!values.lastSignedIn) values.lastSignedIn=new Date(); if(!Object.keys(updateSet).length) updateSet.lastSignedIn=new Date(); await db.insert(users).values(values).onDuplicateKeyUpdate({set:updateSet}); }
export async function getUserByOpenId(openId:string){const db=await getDb(); if(!db)return undefined; const rows=await db.select().from(users).where(eq(users.openId,openId)).limit(1); return rows[0];}
export async function listPublishedPages(){const db=await getDb(); if(!db)return []; return db.select().from(pages).where(eq(pages.status,"published")).orderBy(desc(pages.publishedAt));}
export async function listPages(){const db=await getDb(); if(!db)return []; return db.select().from(pages).orderBy(desc(pages.updatedAt));}
export async function listRevisions(pageId:number){const db=await getDb(); if(!db)return []; return db.select().from(revisions).where(eq(revisions.pageId,pageId)).orderBy(desc(revisions.createdAt));}
export async function createSubmission(formName:string,payload:string){const db=await getDb(); if(!db)return; await db.insert(formSubmissions).values({formName,payload});}
export async function listSubmissions(){const db=await getDb(); if(!db)return []; return db.select().from(formSubmissions).orderBy(desc(formSubmissions.createdAt));}
export async function listNavigation(){const db=await getDb(); if(!db)return []; return db.select().from(navigationItems).where(eq(navigationItems.isVisible,true)).orderBy(navigationItems.displayOrder);}
export async function listAllNavigation(){const db=await getDb(); if(!db)return []; return db.select().from(navigationItems).orderBy(navigationItems.displayOrder);}
export async function listGlobalSections(){const db=await getDb(); if(!db)return []; return db.select().from(globalSections);}
export async function listGlobalSectionRevisions(globalSectionId:number){const db=await getDb(); if(!db)return []; return db.select().from(globalSectionRevisions).where(eq(globalSectionRevisions.globalSectionId,globalSectionId)).orderBy(desc(globalSectionRevisions.createdAt));}
export async function listPublishedProjects(){const db=await getDb(); if(!db)return []; return db.select().from(recentProjects).where(eq(recentProjects.isPublished,true)).orderBy(recentProjects.displayOrder);}
export async function listProjects(){const db=await getDb(); if(!db)return []; return db.select().from(recentProjects).orderBy(recentProjects.displayOrder);}
export async function listMediaAssets(){const db=await getDb(); if(!db)return []; return db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));}
export async function listEmployees(){const db=await getDb(); if(!db) return []; return db.select().from(employees).orderBy(employees.name);}
