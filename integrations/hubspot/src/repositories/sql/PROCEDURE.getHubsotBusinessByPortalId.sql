create
    definer = qa_calls_10_24_2024@`%` procedure getHubspotBusinessByPortalid(IN varaccountid varchar(128))
BEGIN
    /**
     * JIRA TICKETS:
     * =============
     * 2025-01-15: nchan - ENG-7563 Rotate API Key for API Gateway
     */
    select uc.token,
           b.businessid,
           fnGetActiveApiKey(b.apiKey, b.apiKeyExpiration, b.apiKey2, b.apiKey2Expiration) as apiKey
    from userCRM uc
             join businessusers bu
                  on uc.userid = bu.userid
                      and bu.isactive = 1
             join business b
                  on bu.businessid = b.businessid
    where uc.accountid = varaccountid
      and uc.isDeleted = 0
      and crmID = 16;
END;
