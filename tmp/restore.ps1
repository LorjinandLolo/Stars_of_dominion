$headPath = 'c:\Users\lorij\OneDrive\Desktop\Star_of_Dom\lib\ui-mock-data.ts'
$tailPath = 'c:\Users\lorij\OneDrive\Desktop\Star_of_Dom\tmp\good_tail.ts'
$outputPath = 'c:\Users\lorij\OneDrive\Desktop\Star_of_Dom\lib\ui-mock-data.ts'

$head = Get-Content -Path $headPath -TotalCount 16701
$tail = Get-Content -Path $tailPath

# Combine and write
$head + $tail | Set-Content -Path $outputPath
