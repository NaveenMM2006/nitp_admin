"use client"
import Layout from '../components/layout'
import styled from 'styled-components'
import LoadAnimation from '../components/loading'
import { useSession } from 'next-auth/react'
import Loading from '../components/loading'
import Sign from '../components/signin'
import Unauthorise from '../components/unauthorise'
import FileManagementDashboard from './components/Dashboard'

const Wrap = styled.div`
    width: 95%;
    max-width: 1400px;
    margin: auto;
    margin-top: 40px;
    margin-bottom: 40px;
`

export default function FileManagementPage() {
    const { data: session, status } = useSession()

    // Handle loading state
    if (status === 'loading') {
        return <Loading />
    }

    // Handle unauthenticated state
    if (status === 'unauthenticated') {
        return <Sign />
    }

    // Handle authenticated state, checking for SUPER_ADMIN
    if (session?.user?.role === "SUPER_ADMIN") {
        return (
            <Layout>
                <Wrap>
                    <FileManagementDashboard />
                </Wrap>
            </Layout>
        )
    }

    // Handle unauthorized role
    return <Unauthorise />
}
