ALTER TABLE `job_outputs`
    MODIFY `format` ENUM('txt', 'srt', 'pdf', 'docx') NOT NULL;
