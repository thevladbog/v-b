import type { CSSProperties, PropsWithChildren } from "react";
import type { ContactLocale } from "@vbtech/contracts";

const graphite = "#1b1e20";
const ink = "#22262a";
const light = "#f6f3ed";
const line = "#d8d1c5";
const WORDMARK_URL = "https://v-b.tech/assets/vb-wordmark-email.png";

const bodyStyle: CSSProperties = {
  backgroundColor: graphite,
  color: ink,
  fontFamily: "Arial, sans-serif",
  margin: "0",
  padding: "24px 12px",
};

const containerStyle: CSSProperties = {
  backgroundColor: light,
  border: `1px solid ${line}`,
  borderRadius: "4px",
  margin: "0 auto",
  maxWidth: "640px",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  backgroundColor: light,
  borderBottom: `1px solid ${line}`,
  padding: "24px 28px 20px",
};

const wordmarkStyle: CSSProperties = {
  display: "block",
  height: "24px",
  width: "121px",
};

const contentStyle: CSSProperties = { padding: "8px 28px 20px" };

const footerStyle: CSSProperties = {
  color: "#656a70",
  fontFamily: "Arial, sans-serif",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0",
  padding: "12px 28px 24px",
};

const linkStyle: CSSProperties = { color: "#805000", textDecoration: "underline" };

export const EMAIL_STYLES = {
  copy: {
    color: ink,
    fontFamily: "Arial, sans-serif",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "16px 0",
  },
  detailLabel: {
    color: "#656a70",
    fontFamily: "Arial, sans-serif",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.4px",
    lineHeight: "18px",
    margin: "0 0 2px",
    textTransform: "uppercase",
  },
  detailValue: {
    color: ink,
    fontFamily: "Arial, sans-serif",
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0 0 14px",
    whiteSpace: "pre-wrap",
  },
  heading: {
    color: ink,
    fontFamily: "Arial, sans-serif",
    fontSize: "24px",
    fontWeight: "700",
    lineHeight: "30px",
    margin: "20px 0 12px",
  },
  link: linkStyle,
};

export function EmailTheme({
  children,
  footer,
  locale,
  preview,
}: PropsWithChildren<{ footer: string; locale: ContactLocale; preview: string }>) {
  return (
    <html lang={locale}>
      <head>
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />
      </head>
      <body style={bodyStyle}>
        <div style={{ display: "none", maxHeight: "0", opacity: 0, overflow: "hidden" }}>{preview}</div>
        <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: "0 auto", width: "100%" }}>
          <tbody>
            <tr>
              <td align="center">
                <table cellPadding="0" cellSpacing="0" role="presentation" style={containerStyle} width="100%">
                  <tbody>
                    <tr>
                      <td style={headerStyle}>
                        <img
                          alt="v-b.tech"
                          height="24"
                          src={WORDMARK_URL}
                          style={wordmarkStyle}
                          width="121"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td style={contentStyle}>{children}</td>
                    </tr>
                    <tr>
                      <td>
                        <p style={footerStyle}>{footer}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function EmailLink({ children, href }: PropsWithChildren<{ href: string }>) {
  return (
    <a href={href} style={linkStyle}>
      {children}
    </a>
  );
}
