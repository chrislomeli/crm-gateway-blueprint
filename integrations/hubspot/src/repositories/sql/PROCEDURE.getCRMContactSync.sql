DELIMITER ;;

DROP PROCEDURE IF EXISTS `getCRMContactSync`;;

CREATE DEFINER=`bshamsian`@`%` PROCEDURE `getCRMContactSync`(IN invarcontactsyncid bigint)
BEGIN

select * from contactSyncHistory csh
where csh.contactSyncId = invarcontactsyncid;

END ;;
