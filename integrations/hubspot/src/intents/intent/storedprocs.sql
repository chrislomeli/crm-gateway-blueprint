-- =====================================================
-- AIO-14 Intent Management Procedures
-- Merged SQL file containing all intent-related procedures
-- Created: 2025-08-14
-- Author: clomeli
-- =====================================================

-- =====================================================
-- PROCEDURE: intentAddIntent
-- Purpose: Insert new intent records
-- =====================================================

-- Stored procedure to insert new intent records
-- Replaces the direct SQL in intentAddIntents function

DELIMITER $$

DROP PROCEDURE IF EXISTS intentAddIntent $$

CREATE PROCEDURE intentAddIntent(
    IN p_globalTraceId VARCHAR(255),
    IN p_businessid BIGINT,
    IN p_userid BIGINT,
    IN p_externalContactId BIGINT,
    IN p_crmID INT,
    IN p_intentInfo JSON,
    IN p_signalStatus VARCHAR(50),
    IN p_signalOutcome JSON
)
BEGIN
    /**
      Change log:
      -----------
      AOI - 2025-07-31 - clomeli - initial version
     */
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            RESIGNAL;
        END;

    START TRANSACTION;

    INSERT INTO calls.intent (
        globalTraceId,
        businessid,
        userid,
        externalContactId,
        crmID,
        intentInfo,
        signalStatus,
        signalOutcome
    ) VALUES (
                 p_globalTraceId,
                 p_businessid,
                 p_userid,
                 p_externalContactId,
                 p_crmID,
                 p_intentInfo,
                 p_signalStatus,
                 p_signalOutcome
             );

    -- Return the entire inserted record
    SELECT * FROM calls.intent WHERE intentId = LAST_INSERT_ID();

    COMMIT;



END$$

DELIMITER ;

-- =====================================================
-- PROCEDURE: intentGetBusinessIntents
-- Purpose: Get business intents with joins
-- =====================================================

-- Stored procedure to get business intents with joins
-- Replaces the direct SQL in intentGetBusinessIntents function

DELIMITER $$

DROP PROCEDURE IF EXISTS intentGetBusinessIntents $$

CREATE PROCEDURE intentGetBusinessIntents()
BEGIN
    /**
      Change log:
      -----------
      AOI - 2025-07-31 - clomeli - initial version
     */
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            RESIGNAL;
        END;

    SELECT DISTINCT
        B.businessid,
        C.accountid AS portalId,
        D.intentFieldName,
        D.intentScoreThreshold
    FROM userCRM C
             JOIN businessusers B ON C.userid = B.userid
             JOIN businessDetails D ON B.businessid = D.businessid
    WHERE C.crmID = 16
      AND D.intentFieldName IS NOT NULL;

END$$

DELIMITER ;

-- =====================================================
-- PROCEDURE: intentGetIntentByStatus
-- Purpose: Get intent records by status and criteria
-- =====================================================

DELIMITER $$
DROP PROCEDURE IF EXISTS intentGetIntentByStatus $$

CREATE PROCEDURE intentGetIntentByStatus(
    IN p_businessId INT,
    IN p_contactId INT,
    IN p_signalStatus VARCHAR(50),
    IN p_days INT
)
BEGIN
    /**
      Change log:
      -----------
      AOI - 2025-07-31 - clomeli - initial version
     */
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            RESIGNAL;
        END;

    -- Select all records matching the criteria
    SELECT *
    FROM intent
    WHERE businessid = p_businessId
      AND externalContactId = p_contactId
      AND signalStatus = p_signalStatus
      AND createDate > NOW() - INTERVAL p_days DAY
    ORDER BY createDate DESC LIMIT 1;

END$$

DELIMITER ;

-- =====================================================
-- PROCEDURE: intentUpdateIntents
-- Purpose: Update intent status and outcome
-- =====================================================

-- Stored procedure to update intent status and outcome
-- Replaces the direct SQL in intentUpdateIntents function

DELIMITER $$

DROP PROCEDURE IF EXISTS intentUpdateIntents $$

CREATE PROCEDURE  intentUpdateIntents(
    IN p_contactId int,
    IN p_userId int,
    IN p_signalStatus varchar(32),
    IN p_message json)
BEGIN
    /**
      Change log:
      -----------
      AOI - 2025-07-31 - clomeli - initial version
     */
    DECLARE v_signalOutcome JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            RESIGNAL;
        END;

    START TRANSACTION;



    -- Convert message to JSON string
    SET v_signalOutcome = p_message;

    UPDATE calls.intent
    SET signalStatus = p_signalStatus,
        userid = p_userId,
        signalOutcome = v_signalOutcome
    WHERE externalContactId = p_contactId ;

    -- Return affected rows count
    SELECT ROW_COUNT() as affectedRows;

    COMMIT;
END$$

DELIMITER ;

-- =====================================================
-- End of AIO-14 Intent Management Procedures
-- =====================================================
