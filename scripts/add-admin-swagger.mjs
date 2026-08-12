import fs from "fs";
import path from "path";

const routes = {
  "admins/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/admins:
 *   get:
 *     summary: List admins
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list of admins
 */`,
    POST: `
/**
 * @swagger
 * /admin/admins:
 *   post:
 *     summary: Create admin
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: 'string' }
 *               email: { type: 'string' }
 *               tempPassword: { type: 'string' }
 *               role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'VERIFICATION_ADMIN', 'CONTENT_ADMIN', 'FINANCE_ADMIN'] }
 *     responses:
 *       201:
 *         description: Created
 */`
  },
  "admins/[id]/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/admins/{id}:
 *   patch:
 *     summary: Update admin
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role: { type: 'string' }
 *               isActive: { type: 'boolean' }
 *     responses:
 *       200:
 *         description: Updated
 */`
  },
  "auth/login/route.ts": {
    POST: `
/**
 * @swagger
 * /admin/auth/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: 'string' }
 *               password: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "auth/logout/route.ts": {
    POST: `
/**
 * @swagger
 * /admin/auth/logout:
 *   post:
 *     summary: Admin logout
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: 'string' }
 *     responses:
 *       204:
 *         description: Success
 */`
  },
  "auth/me/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/auth/me:
 *   get:
 *     summary: Get current admin
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "auth/refresh/route.ts": {
    POST: `
/**
 * @swagger
 * /admin/auth/refresh:
 *   post:
 *     summary: Refresh admin tokens
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "businesses/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/businesses:
 *   get:
 *     summary: List businesses
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "businesses/[id]/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/businesses/{id}:
 *   get:
 *     summary: Get business details
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "businesses/[id]/verification/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/businesses/{id}/verification:
 *   patch:
 *     summary: Verify or reject business
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action: { type: 'string', enum: ['APPROVE', 'REJECT', 'SUSPEND'] }
 *               reason: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "categories/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/categories:
 *   get:
 *     summary: List categories
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of categories
 */`,
    POST: `
/**
 * @swagger
 * /admin/categories:
 *   post:
 *     summary: Create category
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: 'string' }
 *               parentId: { type: 'string' }
 *               order: { type: 'integer' }
 *     responses:
 *       201:
 *         description: Created
 */`
  },
  "categories/[id]/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/categories/{id}:
 *   patch:
 *     summary: Update category
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: 'string' }
 *               order: { type: 'integer' }
 *               isActive: { type: 'boolean' }
 *     responses:
 *       200:
 *         description: Updated
 */`
  },
  "dashboard/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     summary: Dashboard stats
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "digipins/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/digipins:
 *   get:
 *     summary: List digipins
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "digipins/[id]/status/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/digipins/{id}/status:
 *   patch:
 *     summary: Change digipin status
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "notifications/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/notifications:
 *   get:
 *     summary: List broadcast history
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "notifications/send/route.ts": {
    POST: `
/**
 * @swagger
 * /admin/notifications/send:
 *   post:
 *     summary: Broadcast notification
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target: { type: 'string', enum: ['ALL', 'USER', 'SEGMENT'] }
 *               userId: { type: 'string' }
 *               segment: { type: 'string' }
 *               title: { type: 'string' }
 *               message: { type: 'string' }
 *               type: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "properties/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/properties:
 *   get:
 *     summary: List properties
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "properties/[id]/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/properties/{id}:
 *   get:
 *     summary: Get property details
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "properties/[id]/verification/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/properties/{id}/verification:
 *   patch:
 *     summary: Verify or reject property
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action: { type: 'string', enum: ['APPROVE', 'REJECT'] }
 *               reason: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "subscription-plans/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/subscription-plans:
 *   get:
 *     summary: List plans
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */`,
    POST: `
/**
 * @swagger
 * /admin/subscription-plans:
 *   post:
 *     summary: Create plan
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: 'string' }
 *               tier: { type: 'string' }
 *               price: { type: 'integer' }
 *               durationDays: { type: 'integer' }
 *               features: { type: 'object' }
 *               isActive: { type: 'boolean' }
 *     responses:
 *       201:
 *         description: Created
 */`
  },
  "subscription-plans/[id]/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/subscription-plans/{id}:
 *   patch:
 *     summary: Update plan
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive: { type: 'boolean' }
 *     responses:
 *       200:
 *         description: Updated
 */`
  },
  "subscriptions/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/subscriptions:
 *   get:
 *     summary: List subscriptions
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "transactions/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/transactions:
 *   get:
 *     summary: List transactions
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "users/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List users
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */`
  },
  "users/[id]/route.ts": {
    GET: `
/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Get user details
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */`
  },
  "users/[id]/status/route.ts": {
    PATCH: `
/**
 * @swagger
 * /admin/users/{id}/status:
 *   patch:
 *     summary: Change user status
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountStatus: { type: 'string', enum: ['ACTIVE', 'DEACTIVATED'] }
 *     responses:
 *       200:
 *         description: Success
 */`
  }
};

const BASE_DIR = path.join(process.cwd(), "src", "app", "admin");

for (const [relPath, methods] of Object.entries(routes)) {
  const fullPath = path.join(BASE_DIR, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, "utf8");
    for (const [method, swaggerComment] of Object.entries(methods)) {
      if (content.includes("@swagger")) {
        // Skip if already contains swagger
        continue;
      }
      const regex = new RegExp("export const " + method + " = ", "g");
      content = content.replace(regex, swaggerComment + "\\nexport const " + method + " = ");
    }
    fs.writeFileSync(fullPath, content);
  }
}
