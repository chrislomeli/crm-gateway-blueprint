DELIMITER ;;

DROP PROCEDURE IF EXISTS `updateCRMContactSync`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `updateCRMContactSync`(IN invarcontactsyncid bigint, IN invarstatus varchar(20),
                                                           IN invarsubstatus varchar(50), IN invarerrorobject json)
BEGIN

UPDATE contactSyncHistory csh
set csh.status = case when csh.status != 'failed' then invarstatus else csh.status end, csh.endDate = now(), csh.substatus = invarsubstatus, csh.errorObject = invarerrorobject
where csh.contactSyncId = invarcontactsyncid;

END ;;
