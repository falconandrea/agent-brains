# Security Report Template

## Full Report Template

````markdown
# Security Review Report

## Executive Summary

| Field                  | Value                      |
| ---------------------- | -------------------------- |
| **Application**        | [Application Name]         |
| **Review Date**        | [YYYY-MM-DD]               |
| **Reviewer**           | [Name]                     |
| **Scope**              | [Files/modules reviewed]   |
| **Overall Risk Level** | [Critical/High/Medium/Low] |

### Key Findings

- X Critical confirmed vulnerabilities requiring immediate attention
- Y High-severity confirmed issues to address before deployment
- Z Medium/Low confirmed issues for future consideration
- N findings need validation (no severity yet; each names its missing evidence)

## Findings Summary

Severity counts cover **confirmed findings only**; needs-validation items carry no severity until their evidence lands.

| Severity         | Count | Status                 |
| ---------------- | ----- | ---------------------- |
| Critical         | X     | Requires immediate fix |
| High             | X     | Fix before deployment  |
| Medium           | X     | Fix in next sprint     |
| Low              | X     | Backlog                |
| Needs validation | N     | Blocked on named evidence |

## Detailed Findings

### [HIGH] SQL Injection in User Search

| Field                | Value                                              |
| -------------------- | -------------------------------------------------- |
| **ID**               | SEC-001                                            |
| **Status**           | Confirmed                                          |
| **Location**         | `src/api/users.ts:45`                              |
| **CWE**              | CWE-89                                             |
| **CVSS**             | 7.5 (High) — rated from the demonstrated read path |
| **Boundary**         | HTTP search parameter → SQL query execution        |
| **Expected control** | Parameterized queries                              |
| **Observed**         | PoC search term returned all user rows on the local test instance |
| **Verification**     | Manual PoC request/response on the local test instance; semgrep match re-checked at line 45 |
| **Evidence basis**   | Reproduced                                         |

**Description**
User input directly concatenated into SQL query without sanitization.

**Vulnerable Code**

```typescript
const query = `SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`;
```
````

**Proof of Concept**

```
GET /api/users?search=' OR '1'='1
```

**Impact**

- Demonstrated: an attacker can read all user rows through the search parameter
- Plausible but not demonstrated here: data modification/deletion, SQL-feature escalation — verify separately before claiming

**Remediation**
Use parameterized queries:

```typescript
const query = 'SELECT * FROM users WHERE name LIKE $1';
db.query(query, [`%${searchTerm}%`]);
```

**Effort**: 1 hour
**Priority**: Immediate

---

### [MEDIUM] Missing Ownership Check in Invoice Lookup

| Field                | Value                                              |
| -------------------- | -------------------------------------------------- |
| **ID**               | SEC-002                                            |
| **Status**           | Confirmed                                          |
| **Location**         | `src/routes/invoices.ts:31`                        |
| **CWE**              | CWE-639                                            |
| **CVSS**             | 6.5 (Medium) — rated from the demonstrated read path |
| **Boundary**         | Authenticated user request → another user's invoice record |
| **Expected control** | Ownership check (`invoice.userId === session.user.id`) before returning |
| **Observed**         | Handler loads the invoice by the raw route parameter and returns it unconditionally; no ownership comparison exists anywhere in the path |
| **Verification**     | Static: reachability by construction (every authenticated `GET /invoices/:id` flows through this handler) and the code path itself entails the result — the record is returned with no ownership condition, so no runtime fact is needed |
| **Evidence basis**   | Inference (code inspection) — sufficient under the Confirmed criterion: consequence fully entailed by the code path |

**Description**
The invoice endpoint trusts the user-supplied id and performs no ownership check.

**Vulnerable Code**

```typescript
app.get('/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await db.invoices.findById(req.params.id);
  res.json(invoice); // no ownership check
});
```

**Impact**

- Demonstrated: any authenticated user can read any invoice — the handler returns the requested record with no ownership condition
- Not claimed: how enumerable the ids are affects the scale of exposure; verify separately if relevant

**Remediation**
Verify ownership before returning:

```typescript
app.get('/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await db.invoices.findById(req.params.id);
  if (!invoice || invoice.userId !== req.user.id) return res.sendStatus(404);
  res.json(invoice);
});
```

**Effort**: 30 minutes
**Priority**: Before deployment

---

### [NEEDS VALIDATION] Admin Endpoint Exposure

| Field                | Value                                              |
| -------------------- | -------------------------------------------------- |
| **ID**               | SEC-003                                            |
| **Status**           | Needs validation — no severity until evidence lands |
| **Location**         | `src/routes/admin.ts:8`                            |
| **Boundary**         | Public network → admin routes                      |
| **Expected control** | Network restriction or authentication gate         |
| **Observed**         | Route registered with no in-code network restriction |
| **Verification**     | Code inspection only; production routing/firewall configuration not readable from this repo |
| **Evidence basis**   | Source claim (route exists) + inference — deployment exposure unknown |
| **Missing evidence** | Production routing/firewall configuration for `/admin` |

**Description**
Admin routes have no in-code network restriction; whether production gates them
is a deployment fact this review could not observe. Severity stays unassigned
until that configuration is checked.

**Next step**: Confirm the production routing config; reclassify as Confirmed
(with impact-based severity) or close with evidence.

## Hardening Notes

Controls that would raise the security bar but address no demonstrated
vulnerability. Kept out of the findings and severity counts above.

- Add security headers (CSP, HSTS) — no injection finding depends on them
- Enable automated dependency updates
- Rotate long-lived service tokens on a schedule

## Automated Scan Results

### Dependency Vulnerabilities

| Package | Severity | CVE           | Fix                |
| ------- | -------- | ------------- | ------------------ |
| lodash  | High     | CVE-2021-xxxx | Upgrade to 4.17.21 |

### SAST Findings

| Tool      | Critical | High | Medium | Low |
| --------- | -------- | ---- | ------ | --- |
| Semgrep   | 1        | 3    | 5      | 8   |
| npm audit | 0        | 2    | 4      | 10  |

## Recommendations

### Immediate (This Sprint)

1. Fix SQL injection vulnerability (SEC-001)
2. Implement parameterized queries globally
3. Update vulnerable dependencies

### Short-term (Next Sprint)

1. Add ownership checks to record lookups (SEC-002)
2. Add input validation middleware
3. Enable security headers

### Long-term

1. Implement SAST in CI/CD pipeline
2. Schedule regular security reviews
3. Security training for developers

## Appendix

### Tools Used

- Semgrep v1.x
- npm audit
- Gitleaks v8.x
- Manual code review

### References

- OWASP Top 10 2021
- CWE Database
- CVSS Calculator

```

## Severity Definitions

Severity applies to **confirmed findings only**, rated from the impact the evidence supports. Needs-validation items get no severity until their missing evidence lands.

| Severity | CVSS Score | Response Time |
|----------|------------|---------------|
| Critical | 9.0 - 10.0 | Immediate |
| High | 7.0 - 8.9 | 24-48 hours |
| Medium | 4.0 - 6.9 | 1-2 weeks |
| Low | 0.1 - 3.9 | Next release |

## Evidence Basis Labels

| Label | Meaning |
|-------|---------|
| Source claim | A tool, advisory or dependency report states it; not verified here |
| Inference | Manual analysis of code or config; not executed |
| Reproduced | Observed directly in a test, PoC or query result |

## Quick Reference

| Section | Purpose |
|---------|---------|
| Executive Summary | Management overview |
| Findings Summary | Quick count by severity (confirmed only) |
| Detailed Findings | Technical details with status and evidence basis |
| Scan Results | Automated tool output |
| Recommendations | Prioritized action items |
| Hardening Notes | Improvements separate from findings |
```
