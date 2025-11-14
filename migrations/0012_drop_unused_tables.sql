-- Drop unused tables to clean up the database schema
-- Removing chat system tables, projects table, and unit test tables

DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_threads;
DROP TABLE IF EXISTS chat_rooms;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS unit_test_sessions;
DROP TABLE IF EXISTS unit_test_results;
DROP TABLE IF EXISTS unit_test_definitions;
