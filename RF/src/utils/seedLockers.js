import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { encryptEmployee } from './crypto'

const lockers = [
  { lockerNumber: 'DIS-1', combination: '30-48-12' },
  { lockerNumber: 'DIS-2', combination: '16-46-27' },
  { lockerNumber: 'DIS-3', combination: '03-17-27' },
  { lockerNumber: 'DIS-4', combination: '47-19-37' },
  { lockerNumber: 'DIS-5', combination: '06-24-04' },
  { lockerNumber: 'DIS-6', combination: '13-35-19' },
  { lockerNumber: 'DIS-7', combination: '30-06-44' },
  { lockerNumber: 'DIS-8', combination: '12-42-34' },
  { lockerNumber: 'DIS-9', combination: '29-13-09' },
  { lockerNumber: 'DIS-10', combination: '31-19-29' },
  { lockerNumber: 'DIS-11', combination: '48-00-14' },
  { lockerNumber: 'DIS-12', combination: '15-21-39' },
  { lockerNumber: 'DIS-13', combination: '17-27-49' },
  { lockerNumber: 'DIS-14', combination: '43-03-45' },
  { lockerNumber: 'DIS-15', combination: '19-21-29' },
  { lockerNumber: 'DIS-16', combination: '26-32-20' },
  { lockerNumber: 'DIS-17', combination: '44-16-30' },
]

export const seedLockers = async () => {
  await Promise.all(
    lockers.map(async (locker) => {
      const encryptedLocker = await encryptEmployee({
        lockerNumber: locker.lockerNumber,
        combination: locker.combination,
        assignedEmployeeIds: [],
      })

      await setDoc(doc(db, 'lockers', locker.lockerNumber), {
        ...encryptedLocker,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
  )
}