# Security Specification - TelePixels

## 1. Data Invariants
- A **Patient** must belong to a valid **Facility**.
- A **Request** must belong to a **Patient** and inherit the facility context.
- A **Report** must be created by a user with the 'radiologist' role.
- **Images** can only be uploaded by 'radiographer' or 'facilityadmin' roles.
- **User Roles** are immutable except by 'superadmin'.
- **Logs** are strictly append-only; updates and deletes are forbidden.

## 2. The "Dirty Dozen" Payloads (Red Team Test Cases)

1. **Identity Spoofing**: Attempt to create a user with `uid` different from `request.auth.uid`.
2. **Privilege Escalation**: Attempt to update own user profile to set `role: 'superadmin'`.
3. **Orphaned Request**: Attempt to create a request for a non-existent patient.
4. **Cross-Facility Access**: A 'facilityadmin' of Facility A attempting to read/write patients of Facility B.
5. **Unauthorized Reporting**: A 'receptionist' attempting to create a report.
6. **Shadow Field Injection**: Attempting to update a request with an undocumented field `isApproved: true`.
7. **Resource Poisoning**: Using a 1MB string as a `patientId`.
8. **Bypassing Verification**: Attempting a write with `email_verified: false` (spoofing admin email).
9. **Log Tampering**: Attempting to delete a log entry.
10. **State Shortcutting**: Updating a request status from 'pending' directly to 'completed' without a report.
11. **Metadata Manipulation**: Attempting to change `createdAt` on an existing document.
12. **Unauthenticated Write**: Attempting to create a patient without any auth token.

## 3. Test Runner Logic (Conceptual)
All the above payloads must return `PERMISSION_DENIED` by the rules.
