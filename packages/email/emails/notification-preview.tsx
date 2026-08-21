import { ContactNotification } from "../src/notification.js";

export default function NotificationPreview() {
  return (
    <ContactNotification
      input={{
        locale: "en",
        requestId: "11111111-1111-4111-8111-111111111111",
        receivedAt: new Date("2026-08-20T12:00:00Z"),
        sourcePath: "/en/",
        consentId: "VBT-PD-02/DRAFT",
        name: "Vlad Bogatyrev",
        contact: "hello@example.com",
        message: "Build the product safely.",
      }}
    />
  );
}
