/**
 * Transform HubSpot contacts to internal format
 * Handles data mapping and phone number conversion
 */

import { toE164Format } from '../utils/phone-utils';
import { HubspotContact, HubspotDeal } from '../types/hubspot-types';

export class ContactTransformer {
  private businessId: number;
  private portalId: number;

  constructor({ businessId, portalId }: {businessId: number, portalId: number}) {
    this.businessId = businessId;
    this.portalId = portalId;
  }

  /**
   * Transform HubSpot contact to internal format
   */
  transformContact(params: {
    contact: HubspotContact;
    deals: HubspotDeal[];
    ownerMap: Record<string, string>;
    traceMetadata?: {
      source?: string;
      traceId?: string;
      spanId?: string;
    };
  }): any {
    const { contact, deals, ownerMap, traceMetadata } = params;
    const p = contact.properties || {};
    
    const transformed: any = {
      // Metadata
      acmecrmid: '16',
      crmname: 'hubspot',
      businessid: this.businessId,
      externalid: parseInt(contact.id),
      created_at: this.formatDate(new Date()),
      
      // Raw data for reference
      rawContact: contact,
      rawDeals: deals,
      
      // Initialize structures
      name: {},
      company: {},
      emails: [],
      phones: [],
      phone164: [],
      addresses: [],
      crmlinks: {},
      deals: {},
      
      // Owner mapping
      ownerid: p.hubspot_owner_id || '',
      acmeownerid: '',
      
      // Processing metadata (separate from core contact data)
      processingMetadata: {
        lastUpdated: this.formatDate(new Date()),
        source: traceMetadata?.source || 'unknown',
        traceId: traceMetadata?.traceId,
        spanId: traceMetadata?.spanId
      }
    };

    // Map owner ID
    if (transformed.ownerid && ownerMap[transformed.ownerid]) {
      transformed.acmeownerid = ownerMap[transformed.ownerid].toString();
    }

    // Name
    if (p.firstname) transformed.name.firstName = p.firstname;
    if (p.lastname) transformed.name.lastName = p.lastname;

    // Company
    if (p.associatedcompanyid) {
      transformed.company.id = p.associatedcompanyid;
    }
    if (p.company) {
      transformed.company.name = p.company;
    }

    // Email
    if (p.email) {
      transformed.emails.push({ 
        type: 'primary', 
        email: p.email 
      });
    }

    // Phones
    if (p.phone) {
      transformed.phones.push({ 
        type: 'phone', 
        phone: p.phone 
      });
    }
    if (p.mobilephone) {
      transformed.phones.push({ 
        type: 'mobile', 
        phone: p.mobilephone 
      });
    }

    // Address
    if (p.address || p.city || p.state || p.zip) {
      transformed.addresses.push({
        type: 'primary',
        address: {
          street: p.address || '',
          city: p.city || '',
          state: p.state || '',
          zip: p.zip || ''
        }
      });
    }

    // CRM link
    transformed.crmlinks.weblink = 
      `https://app.hubspot.com/contacts/${this.portalId}/contact/${contact.id}/`;

    // Process deals
    if (deals && deals.length > 0) {
      const transformedDeals = this.transformDeals(deals);
      
      // Store the most recent open deal, or the most recent deal if no open deals
      const openDeals = transformedDeals.filter(d => d.acmeStatus === 'open');
      if (openDeals.length > 0) {
        transformed.deals = openDeals.sort((a, b) => 
          (b.lastModified || '').localeCompare(a.lastModified || '')
        )[0];
      } else if (transformedDeals.length > 0) {
        transformed.deals = transformedDeals[0];
      }
    }

    return transformed;
  }

  /**
   * Transform HubSpot deals
   */
  private transformDeals(deals: HubspotDeal[]): any[] {
    return deals.map(deal => {
      const p = deal.properties || {};
      
      return {
        id: deal.id,
        pipeline: p.pipeline,
        stage: p.dealstage,
        link: `https://app.hubspot.com/deals/${this.portalId}/deal/${deal.id}/`,
        name: p.dealname,
        title: p.title,
        ownerid: p.hubspot_owner_id,
        created: p.createdate,
        lastModified: p.hs_lastmodifieddate,
        value: Number(p.amount) || 0,
        acmeStatus: this.getDealStatus(p.dealstage)
      };
    });
  }

  /**
   * Determine deal status based on stage
   */
  private getDealStatus(stage: string): string {
    const closedStages = ['lost', 'won', 'closed'];
    return closedStages.includes(stage?.toLowerCase()) ? 'closed' : 'open';
  }

  /**
   * Convert phone numbers to E164 format
   */
  convertPhoneNumbers(contact: any): any {
    const converted = { ...contact };
    
    if (converted.phones && converted.phones.length > 0) {
      converted.phone164 = converted.phones.map((phoneObj: { phone: string, type: string }) => {
        const e164 = toE164Format(phoneObj.phone);
        return {
          type: phoneObj.type,
          phone: e164,
          original: phoneObj.phone
        };
      });
    }
    
    return converted;
  }

  /**
   * Format date for database
   */
  private formatDate(date: Date): string {
    const pad = (num: number) => num.toString().padStart(2, '0');
    
    return (
      [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
      ].join('-') +
      ' ' +
      [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
      ].join(':')
    );
  }
}
