DELIMITER ;;

DROP PROCEDURE IF EXISTS `updateContactSyncProgress`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `updateContactSyncProgress`(IN varcontactsyncid int, IN varsyncedCount int, IN varrecursionCount tinyint(1))
BEGIN
	# 2024-04-15: aliu - ENG-5771 - C.S. Salesforce: Add progress to logs and contactSyncHistory table as syncing contacts
	IF varrecursionCount = 1 THEN
		update contactSyncStats
        set totalSynced = totalSynced + syncedCount, recursionCount = recursionCount + 1, syncedCount = 0, updatedDateTime = now()
        where contactSyncId = varcontactsyncid;
    ELSE
		update contactSyncStats
        set syncedCount = varsyncedCount + syncedCount, updatedDateTime = now()
        where contactSyncId = varcontactsyncid;
    END IF;
    
    select css.totalSynced, css.syncedCount, csh.organizationId from contactSyncHistory csh
    join contactSyncStats css on css.contactSyncId = csh.contactSyncId
    where csh.contactSyncId = varcontactsyncid;

END ;;
