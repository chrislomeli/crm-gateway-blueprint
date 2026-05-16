DELIMITER ;;

DROP PROCEDURE IF EXISTS `initiateCRMContactSync`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `initiateCRMContactSync`(IN invarbusinessid bigint, IN invarcrmid int,
                                        IN invarinituserid bigint, IN invarsyncuserid bigint,
                                        IN invarsource varchar(20), IN invarorgid varchar(100),
                                        IN invartransactionid varchar(50))
begin
    /**
     * for given bid, if there is already an active contact sync in-progress for a given CRM
     * then do not perform an additional contact sync for the bid.
     *
     * 2024-03-07: aliu - ENG-5749 - Fix pipedrive syncs stuck in started
     * 2023-06-20: aliu/nchan - ENG-4430 - Update "Sync Contacts" button in Dashboard to remove all contacts from ES
     * 2024-04-03: aliu - ENG-5779 - Contact Sync - All CRM's: Catch DynamoDB throttling and store as an error and continue
     * 2024-05-01: aliu - ENG-5964 - Investigate Pipedrive2 Contact Syncs stuck in started mode
     * 2024-06-15: nchan - ENG-6188 - Ensure if more than 5 unit test fail we stop travis push
     */
    declare existingSyncId int;
    -- return 0 for duplicate row
    declare exit handler for sqlstate '23000'
    begin
        GET DIAGNOSTICS CONDITION 1 @errno = MYSQL_ERRNO, @message_text = MESSAGE_TEXT;
        select 0 as contactSyncId, @errno as errno, @message_text as errmsg;
    end;

    -- check if any other started syncs
    select csh.contactSyncId
    into existingSyncId
    from contactSyncHistory csh
    where csh.businessId = invarbusinessid
      and CASE WHEN invarorgid IS NULL THEN
                   csh.organizationId IS NULL
               ELSE
                   csh.organizationID = invarorgid
          END
      and csh.crmId = invarcrmid
      and csh.status = 'started';

    IF (existingSyncId is null) THEN
        insert into contactSyncHistory (`businessId`, `source`, `initiatedByUserId`, `syncUserId`, `crmId`, `status`, `organizationId`, `transactionId`)
        values (invarbusinessid, invarsource, invarinituserid, invarsyncuserid, invarcrmid, 'started', invarorgid, invartransactionid);

        select last_insert_id() as contactSyncId;

        insert into contactSyncStats (contactSyncId) VALUES (last_insert_id());

        update contactSyncHistory set status = 'failed'
        where businessId = invarbusinessid
          and crmId = invarcrmid
          and status = 'started'
          and organizationId = invarorgid
          and contactSyncId != existingSyncId;
    ELSE
        select 0 as contactSyncId, 0 as errno, null as errmsg;
    END IF;
end ;;
DELIMITER ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
DELIMITER ;;
